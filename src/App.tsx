import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChildSelectionScreen } from './components/ChildSelectionScreen';
import { EntryModeScreen } from './components/EntryModeScreen';
import { AppLogo } from './components/AppLogo';
import { ParentGate } from './components/ParentGate';
import { useAuth, type AuthState } from './hooks/useAuth';
import type { User } from '@supabase/supabase-js';
import { contextFromAccountChild, useAccountChildren, type AccountChild } from './hooks/useAccountChildren';
import { useFamilyData } from './hooks/useFamilyData';
import {
  APP_MODE_STORAGE_KEY,
  clearPersistedFamilyContext,
  getDeviceSetupStorageKey,
  isFamilyContext,
  loadPersistedFamilyContext,
  parseDeviceSetup,
  persistFamilyContext,
  purgeAccountStorage,
  resolveAppEntryDecision,
  serializeDeviceSetup,
  type DeviceSetupMode,
  type FamilyContext,
} from './lib/familyIdentity';
import {
  completeAppOnboarding,
  enterChildMode,
  getAppOnboardingStatus,
  getServerAppMode,
  type LearningSessionRow,
} from './lib/familyRepository';

const ChildApp = lazy(() => import('./features/child/ChildApp').then((module) => ({ default: module.ChildApp })));
const ParentDashboard = lazy(() => import('./features/parent/ParentDashboard').then((module) => ({ default: module.ParentDashboard })));

function getStoredDeviceSetup(userId: string): DeviceSetupMode | null {
  try {
    return parseDeviceSetup(
      localStorage.getItem(getDeviceSetupStorageKey(userId)),
      userId,
    )?.mode ?? null;
  } catch {
    return null;
  }
}

function persistDeviceSetup(userId: string, mode: DeviceSetupMode): void {
  try {
    localStorage.setItem(getDeviceSetupStorageKey(userId), serializeDeviceSetup(userId, mode));
  } catch {
    // Without storage the app safely asks for a mode again on the next load.
  }
}

function persistMode(mode: 'parent' | 'child') {
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // The in-memory mode remains usable when storage is unavailable.
  }

  const url = new URL(window.location.href);
  if (mode === 'child') url.searchParams.set('role', 'child');
  else url.searchParams.delete('role');
  window.history.replaceState(null, '', url);
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-status-screen">
        <div className="app-status-card">
          <h1>Ứng dụng gặp lỗi</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>Tải lại</button>
        </div>
      </main>
    );
  }
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="app-status-screen">
      <div className="app-loading-state">
        <AppLogo className="app-loading-logo" />
        <b>{label}</b>
      </div>
    </main>
  );
}

type AuthenticatedAuthState = Omit<AuthState, 'user' | 'loading'> & {
  user: User;
  loading: false;
};

type ModeCheckState = 'idle' | 'checking' | 'rechecking' | 'ready' | 'error' | 'recheck-error';

function ModeRecheckBarrier({
  state,
  error,
  onRetry,
}: {
  state: 'rechecking' | 'recheck-error';
  error: string | null;
  onRetry: () => void;
}) {
  const barrierRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => barrierRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const failed = state === 'recheck-error';
  return (
    <div
      ref={barrierRef}
      className="mode-recheck-layer"
      role={failed ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-busy={!failed}
      aria-labelledby="mode-recheck-title"
      aria-describedby="mode-recheck-description"
      tabIndex={-1}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="mode-recheck-card">
        {!failed ? <span className="mode-recheck-spinner" aria-hidden="true" /> : null}
        <span className="mode-recheck-copy">
          <b id="mode-recheck-title">
            {failed ? 'Chưa xác minh được quyền truy cập' : 'Đang xác minh quyền truy cập'}
          </b>
          <small id="mode-recheck-description">
            {failed ? (error ?? 'Không thể kết nối để kiểm tra quyền.') : 'Dữ liệu đang chỉnh sửa vẫn được giữ nguyên.'}
          </small>
        </span>
        {failed ? (
          <button type="button" onClick={onRetry}>Thử lại</button>
        ) : null}
      </div>
    </div>
  );
}

function AuthenticatedApp({ auth }: { auth: AuthenticatedAuthState }) {
  const accountChildren = useAccountChildren(auth.user);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  // This component is keyed by account ID. Restore only that account's
  // context; the legacy unscoped key may contain another signed-in account.
  const [context, setContext] = useState<FamilyContext | null>(() => (
    loadPersistedFamilyContext(auth.user.id)
  ));
  const [role, setRole] = useState<'parent' | 'child'>('parent');
  const [modeCheckState, setModeCheckState] = useState<ModeCheckState>('idle');
  const [modeCheckGeneration, setModeCheckGeneration] = useState(0);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [entryModeInitialStep, setEntryModeInitialStep] = useState<'mode' | 'child'>('mode');
  const [parentGateOpen, setParentGateOpen] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const hasVerifiedMode = useRef(false);
  const authUserId = auth.user.id;
  // localStorage is user-controlled and the legacy global context key may be
  // stale. A family context is usable only when its parent profile belongs to
  // the currently authenticated account.
  const activeContext = context?.parentProfileId === authUserId ? context : null;
  const keepsVerifiedUiMounted = modeCheckState === 'ready'
    || modeCheckState === 'rechecking'
    || modeCheckState === 'recheck-error';
  const familyState = useFamilyData(
    keepsVerifiedUiMounted && !onboardingRequired ? activeContext : null,
    role,
  );
  const contextFamilyId = activeContext?.familyId;
  const contextParentId = activeContext?.parentProfileId;
  const contextChildId = activeContext?.childProfileId;

  // Keep the selected child synchronized with the account's managed profiles.
  useEffect(() => {
    if (!authUserId) {
      // During getSession() the user is temporarily null. Clearing here used
      // to erase the selected second child before Auth finished bootstrapping.
      if (auth.loading) return;
      setContext(null);
      clearPersistedFamilyContext();
      return;
    }

    // A cached context may help the parent dashboard, but it must never choose
    // a child while this auth session is still being verified or the explicit
    // entry picker is open.
    if (modeCheckState !== 'ready' || onboardingRequired) return;
    if (childPickerOpen) return;
    if (role === 'child') return;
    if (accountChildren.loading) return;
    if (accountChildren.error) return;

    if (accountChildren.children.length > 0) {
      const selectedContext = contextFamilyId && contextParentId && contextChildId
        ? {
          familyId: contextFamilyId,
          parentProfileId: contextParentId,
          childProfileId: contextChildId,
        }
        : loadPersistedFamilyContext(authUserId);
      const match = selectedContext
        ? accountChildren.children.find((child) => (
          child.account_space_id === selectedContext.familyId
          && child.parent_profile_id === selectedContext.parentProfileId
          && child.child_profile_id === selectedContext.childProfileId
        ))
        : undefined;
      const canonicalContext = match ? contextFromAccountChild(match) : null;
      if (canonicalContext) {
        if (contextFamilyId !== canonicalContext.familyId
            || contextParentId !== canonicalContext.parentProfileId
            || contextChildId !== canonicalContext.childProfileId) {
          setContext(canonicalContext);
        }
        persistFamilyContext(authUserId, canonicalContext);
        return;
      }

      // A missing or stale selection must be resolved explicitly. Falling
      // back to children[0] makes a valid save target the wrong child.
      setContext(null);
      clearPersistedFamilyContext(authUserId);
      return;
    }

    setContext(null);
    clearPersistedFamilyContext(authUserId);
  }, [
    accountChildren.children,
    accountChildren.error,
    accountChildren.loading,
    auth.loading,
    authUserId,
    childPickerOpen,
    contextChildId,
    contextFamilyId,
    contextParentId,
    modeCheckState,
    onboardingRequired,
    role,
  ]);

  // The server-side session mode is authoritative. A parent session can reuse
  // only a versioned marker for this account; URL and cached context values
  // never select a child. Missing setup on this device always reopens the
  // explicit chooser.
  useEffect(() => {
    if (!authUserId) {
      setModeCheckState('idle');
      setOnboardingRequired(false);
      hasVerifiedMode.current = false;
      return;
    }
    let active = true;
    const isBackgroundRecheck = hasVerifiedMode.current;
    setModeCheckState(isBackgroundRecheck ? 'rechecking' : 'checking');
    setModeError(null);
    const finishModeCheck = () => {
      hasVerifiedMode.current = true;
      setModeCheckState('ready');
    };
    void (async () => {
      try {
        const [serverMode, onboardingComplete] = await Promise.all([
          getServerAppMode(),
          getAppOnboardingStatus(),
        ]);
        if (!active) return;

        const deviceSetup = getStoredDeviceSetup(authUserId);
        const entryDecision = resolveAppEntryDecision(
          serverMode.appMode,
          onboardingComplete,
          deviceSetup,
        );

        if (entryDecision === 'server-child') {
          if (!serverMode.familyId || !serverMode.childProfileId) {
            throw new Error('Máy chủ chưa xác định được hồ sơ cho chế độ trẻ.');
          }
          const serverContext: FamilyContext = {
            familyId: serverMode.familyId,
            parentProfileId: authUserId,
            childProfileId: serverMode.childProfileId,
          };
          setContext((current) => (
            current?.familyId === serverContext.familyId
              && current.parentProfileId === serverContext.parentProfileId
              && current.childProfileId === serverContext.childProfileId
              ? current
              : serverContext
          ));
          setEntryModeInitialStep('child');
          setOnboardingRequired(false);
          setRole('child');
          persistDeviceSetup(authUserId, 'child');
          persistMode('child');
          persistFamilyContext(authUserId, serverContext);
          finishModeCheck();
          return;
        }

        if (entryDecision === 'choose-mode') {
          setEntryModeInitialStep('mode');
          setOnboardingRequired(true);
          setRole('parent');
          persistMode('parent');
          finishModeCheck();
          return;
        }

        if (entryDecision === 'choose-child') {
          // A fresh parent auth session is no longer locked to the previous
          // child. Require a new explicit profile click instead of reusing the
          // first account child or a cached context.
          setEntryModeInitialStep('child');
          setOnboardingRequired(true);
          setRole('parent');
          persistMode('parent');
          finishModeCheck();
          return;
        }

        setEntryModeInitialStep('mode');
        setOnboardingRequired(false);
        setRole('parent');
        persistMode('parent');
        finishModeCheck();
      } catch (cause) {
        if (!active) return;
        setModeError(cause instanceof Error ? cause.message : 'Không xác minh được chế độ ứng dụng.');
        setModeCheckState(isBackgroundRecheck ? 'recheck-error' : 'error');
      }
    })();
    return () => {
      active = false;
    };
  }, [authUserId, modeCheckGeneration]);

  // Supabase auth storage is shared by tabs, and app_device_modes applies to
  // that shared auth session. Re-check whenever another tab changes the app
  // mode or this tab becomes active again so a stale parent dashboard cannot
  // remain visible after the device has been handed to a child.
  useEffect(() => {
    if (!authUserId) return;

    let scheduledFrame: number | null = null;
    const scheduleModeRecheck = () => {
      // Block privileged interaction without unmounting the verified UI. A
      // native image picker backgrounds the WebView, then emits focus and
      // visibilitychange on return; unmounting here would discard its File.
      setModeCheckState((current) => (
        current === 'ready' || current === 'rechecking' || current === 'recheck-error'
          ? 'rechecking'
          : 'checking'
      ));
      if (scheduledFrame !== null) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        setModeCheckGeneration((generation) => generation + 1);
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === APP_MODE_STORAGE_KEY) scheduleModeRecheck();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleModeRecheck();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', scheduleModeRecheck);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', scheduleModeRecheck);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
    };
  }, [authUserId]);

  const handleChildSelected = (newContext: FamilyContext) => {
    if (!isFamilyContext(newContext) || newContext.parentProfileId !== authUserId) return;
    setContext(newContext);
    setChildPickerOpen(false);
    if (authUserId) persistFamilyContext(authUserId, newContext);
  };

  const handleAccountChildSelected = (child: AccountChild) => {
    const nextContext = contextFromAccountChild(child);
    if (nextContext) handleChildSelected(nextContext);
  };

  const handleLogout = async () => {
    try {
      purgeAccountStorage(auth.user?.id ?? '');
      localStorage.removeItem(APP_MODE_STORAGE_KEY);
    } catch {
      // ignore
    }
    await auth.signOut();
  };

  const handleSwitchToChild = async () => {
    if (!activeContext) return;
    setModeError(null);
    try {
      await enterChildMode(activeContext);
      persistDeviceSetup(authUserId, 'child');
      persistMode('child');
      setParentGateOpen(false);
      setRole('child');
    } catch (cause) {
      setModeError(cause instanceof Error ? cause.message : 'Không chuyển được sang chế độ trẻ.');
      throw cause;
    }
  };

  const handleInitialParentSelected = async () => {
    if (!authUserId) throw new Error('Phiên đăng nhập đã hết hạn.');
    setModeError(null);
    const serverMode = await completeAppOnboarding('parent');
    if (serverMode.appMode !== 'parent') {
      throw new Error('Máy chủ chưa xác nhận chế độ ba/mẹ.');
    }
    persistDeviceSetup(authUserId, 'parent');
    persistMode('parent');
    const currentChild = activeContext
      ? accountChildren.children.find((child) => (
        child.account_space_id === activeContext.familyId
        && child.parent_profile_id === activeContext.parentProfileId
        && child.child_profile_id === activeContext.childProfileId
      ))
      : undefined;
    // This default is allowed only immediately after the user explicitly
    // chooses parent mode. Recovery/reload paths never fall back silently.
    const initialChild = currentChild ?? accountChildren.children[0];
    const initialContext = initialChild ? contextFromAccountChild(initialChild) : null;
    if (initialContext) handleChildSelected(initialContext);
    setEntryModeInitialStep('mode');
    setRole('parent');
    setOnboardingRequired(false);
  };

  const handleInitialChildSelected = async (child: AccountChild) => {
    if (!authUserId) throw new Error('Phiên đăng nhập đã hết hạn.');
    const nextContext = contextFromAccountChild(child);
    if (!nextContext) throw new Error('Hồ sơ của bé không hợp lệ.');
    setModeError(null);
    const serverMode = await completeAppOnboarding('child', nextContext);
    if (serverMode.appMode !== 'child'
        || serverMode.familyId !== nextContext.familyId
        || serverMode.childProfileId !== nextContext.childProfileId) {
      throw new Error('Máy chủ chưa khóa đúng hồ sơ trẻ đã chọn.');
    }
    handleChildSelected(nextContext);
    persistDeviceSetup(authUserId, 'child');
    persistMode('child');
    setEntryModeInitialStep('child');
    setRole('child');
    setOnboardingRequired(false);
  };

  const handleParentAccessRequested = () => {
    setParentGateOpen(true);
  };

  const handleParentVerified = async (password: string) => {
    if (!authUserId) throw new Error('Phiên đăng nhập đã hết hạn.');
    await auth.verifyPassword(password);
    const serverMode = await getServerAppMode();
    if (serverMode.appMode !== 'parent') {
      throw new Error('Phiên đăng nhập chưa được máy chủ xác nhận là ba/mẹ.');
    }
    persistDeviceSetup(authUserId, 'parent');
    persistMode('parent');
    setEntryModeInitialStep('mode');
    setRole('parent');
    setParentGateOpen(false);
  };

  const currentSession = useMemo((): LearningSessionRow | undefined => {
    if (!familyState.data) return undefined;
    const { sessions } = familyState.data;

    // 1. Any active session (in progress or awaiting review) takes priority
    const active = sessions.find((session) =>
      ['in_progress', 'awaiting_parent'].includes(session.status)
    );
    if (active) return active;

    // 2. Only a real database session scheduled for today may be started.
    const scheduledForToday = sessions
      .filter((session) => {
        if (session.status !== 'scheduled') return false;
        const sessionDate = new Date(session.starts_at);
        return sessionDate.toDateString() === new Date().toDateString();
      })
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())[0];
    if (scheduledForToday) return scheduledForToday;
    return undefined;
  }, [familyState.data]);

  if (modeCheckState === 'checking' || modeCheckState === 'idle') {
    return <LoadingScreen label="Đang xác minh chế độ ứng dụng…" />;
  }
  if (modeCheckState === 'error') {
    return (
      <main className="app-status-screen">
        <div className="app-status-card" role="alert">
          <h1>Chưa xác minh được quyền truy cập</h1>
          <p>{modeError}</p>
          <button type="button" onClick={() => setModeCheckGeneration((value) => value + 1)}>Thử lại</button>
        </div>
      </main>
    );
  }

  const backgroundModeCheck = modeCheckState === 'rechecking' || modeCheckState === 'recheck-error'
    ? modeCheckState
    : null;
  const preserveVerifiedScreen = (content: ReactNode) => (
    <>
      <div
        className="verified-app-shell"
        inert={backgroundModeCheck ? true : undefined}
        aria-hidden={backgroundModeCheck ? true : undefined}
      >
        {content}
      </div>
      {backgroundModeCheck ? (
        <ModeRecheckBarrier
          state={backgroundModeCheck}
          error={modeError}
          onRetry={() => setModeCheckGeneration((value) => value + 1)}
        />
      ) : null}
    </>
  );

  if (accountChildren.loading && (!activeContext || onboardingRequired)) {
    return preserveVerifiedScreen(<LoadingScreen label="Đang tải danh sách con…" />);
  }

  if (onboardingRequired) {
    return preserveVerifiedScreen(
      <EntryModeScreen
        accountName={typeof auth.user.user_metadata?.full_name === 'string' ? auth.user.user_metadata.full_name : 'Phụ huynh'}
        accountEmail={auth.user.email}
        children={accountChildren.children}
        childrenError={accountChildren.error ?? modeError}
        initialStep={entryModeInitialStep}
        onSelectParent={handleInitialParentSelected}
        onSelectChild={handleInitialChildSelected}
        onLogout={handleLogout}
      />
    );
  }

  if (!activeContext || childPickerOpen) {
    if (role === 'child') {
      return preserveVerifiedScreen(
        <>
          <main className="app-status-screen">
            <div className="app-status-card">
              <h1>Cần ba/mẹ chọn hồ sơ</h1>
              <p>Hồ sơ của bé chưa sẵn sàng trên thiết bị này.</p>
              <button type="button" onClick={handleParentAccessRequested}>Mở trang ba/mẹ</button>
            </div>
          </main>
          <ParentGate
            open={parentGateOpen}
            accountEmail={auth.user.email}
            onClose={() => setParentGateOpen(false)}
            onVerify={handleParentVerified}
          />
        </>
      );
    }

    return preserveVerifiedScreen(
      <ChildSelectionScreen
        user={auth.user}
        children={accountChildren.children}
        childrenError={accountChildren.error}
        onChildSelected={handleChildSelected}
        onAddChild={accountChildren.addChild}
        onLogout={handleLogout}
      />
    );
  }

  if (familyState.loading && !familyState.data) {
    return preserveVerifiedScreen(<LoadingScreen label="Đang tải dữ liệu của bé…" />);
  }

  if (!familyState.data) {
    return preserveVerifiedScreen(
      <main className="app-status-screen">
        <div className="app-status-card">
          <h1>Không tải được dữ liệu</h1>
          <p>{familyState.error}</p>
          <button type="button" onClick={() => setChildPickerOpen(true)}>Chọn lại bé</button>
        </div>
      </main>
    );
  }

  const application = role === 'parent' ? (
    <ParentDashboard
      data={familyState.data}
      accountName={typeof auth.user.user_metadata?.full_name === 'string' ? auth.user.user_metadata.full_name : 'Phụ huynh'}
      accountEmail={auth.user.email}
      children={accountChildren.children}
      childrenError={accountChildren.error}
      selectedChildId={activeContext.childProfileId}
      currentSession={currentSession}
      saving={familyState.saving}
      loadingMore={familyState.loadingMore}
      error={familyState.error ?? modeError}
      onApprove={familyState.approveSession}
      onAddGoal={familyState.addGoal}
      onSaveSchedule={familyState.saveSchedule}
      onGenerateWeek={familyState.generateWeek}
      onApplyWeek={() => familyState.data?.aiPlan ? familyState.applyWeek(familyState.data.aiPlan) : Promise.resolve()}
      onLoadMoreSessions={familyState.loadMoreSessions}
      onRefresh={familyState.refresh}
      onMarkNotificationRead={familyState.markNotificationRead}
      onSaveMilestone={familyState.saveMilestone}
      onCreateDevicePairing={familyState.createDevicePairing}
      onRevokeDevice={familyState.revokeDevice}
      onUpdateProfile={async (childName, gradeLevel, avatarFile, removeAvatar) => {
        await familyState.updateProfile(childName, gradeLevel, avatarFile, removeAvatar);
        await accountChildren.refresh();
      }}
      onAddChild={accountChildren.addChild}
      onSelectChild={handleAccountChildSelected}
      onClearData={familyState.clearAllData}
      onSwitchToChild={handleSwitchToChild}
      onLogout={handleLogout}
    />
  ) : (
    <>
      <ChildApp
        key={`${activeContext.familyId}:${currentSession?.id ?? 'none'}`}
        data={familyState.data}
        currentSession={currentSession}
        saving={familyState.saving}
        loadingMore={familyState.loadingMore}
        error={familyState.error}
        accountName={typeof auth.user.user_metadata?.full_name === 'string' ? auth.user.user_metadata.full_name : 'Phụ huynh'}
        accountEmail={auth.user.email}
        onStartSession={() => currentSession ? familyState.startSession(currentSession) : Promise.resolve()}
        onRequestBreak={(minutes) => currentSession ? familyState.requestBreak(currentSession, minutes) : Promise.resolve()}
        onSaveNote={(note) => currentSession ? familyState.saveNote(currentSession, note) : Promise.resolve()}
        onMessageParent={familyState.sendParentMessage}
        onRedeemMilestone={familyState.redeemMilestone}
        onSubmitSession={(input) => currentSession
          ? familyState.submitSession({ ...input, session: currentSession })
          : Promise.resolve()}
        onUploadEvidence={(file) => currentSession
          ? familyState.uploadEvidence(currentSession.id, file)
          : Promise.reject(new Error('Không có buổi học hiện tại.'))}
        onLoadMoreSessions={familyState.loadMoreSessions}
        onSwitchToParent={handleParentAccessRequested}
        onLogout={handleLogout}
      />
      <ParentGate
        open={parentGateOpen}
        accountEmail={auth.user.email}
        onClose={() => setParentGateOpen(false)}
        onVerify={handleParentVerified}
      />
    </>
  );
  return preserveVerifiedScreen(
    <Suspense fallback={<LoadingScreen label="Đang mở giao diện…" />}>{application}</Suspense>,
  );
}

export default function App() {
  const auth = useAuth();

  if (auth.loading) return <LoadingScreen label="Đang kiểm tra đăng nhập…" />;
  if (!auth.user) return <AuthScreen auth={auth} onAuthSuccess={() => undefined} />;

  // Supabase auth is shared between tabs and can transition directly from
  // account A to B without an intermediate signed-out render. Remount every
  // account-scoped hook/state atomically so no cached child or family payload
  // from A can be rendered under B's identity, even for one frame.
  return (
    <AuthenticatedApp
      key={auth.user.id}
      auth={auth as AuthenticatedAuthState}
    />
  );
}
