import { useState } from 'react';
import { AppSidebar } from '../../components/AppSidebar';
import { ChildProfileSheet } from '../../components/ChildProfileSheet';
import type { AccountChild } from '../../hooks/useAccountChildren';
import { getDayKey } from '../../lib/date';
import { isSelfStudyType } from '../../domain/schedulePolicy';
import type {
  FamilyData,
  ChildMilestoneInput,
  DevicePairingResult,
  DevicePlatform,
  LearningSessionRow,
  ScheduleEventRow,
  ScheduleSetupItem,
} from '../../lib/familyRepository';
import type { DayKey } from '../../types';
import { ExceptionsPanel } from './components/ExceptionsPanel';
import { LearningPanel } from './components/LearningPanel';
import { ParentHeader } from './components/ParentHeader';
import { GoalModal, MilestoneModal, NotificationCenter, SessionDetailsModal } from './components/ParentModals';
import { ParentNav, type ParentTab } from './components/ParentNav';
import { PlanPanel } from './components/PlanPanel';
import { TodayPanel } from './components/TodayPanel';
import { WeekPanel } from './components/WeekPanel';
import { ScheduleSetupPanel } from './components/ScheduleSetupPanel';
import { DeviceManagementDialog } from './components/DeviceManagementDialog';

interface ParentDashboardProps {
  data: FamilyData;
  accountName: string;
  accountEmail?: string | null;
  children: AccountChild[];
  childrenError?: string | null;
  selectedChildId: string;
  currentSession?: LearningSessionRow;
  saving: boolean;
  loadingMore: boolean;
  error: string | null;
  onApprove: (session: LearningSessionRow) => Promise<void>;
  onAddGoal: (subject: string, minutes: number) => Promise<void>;
  onSaveSchedule: (items: ScheduleSetupItem[]) => Promise<void>;
  onGenerateWeek: () => Promise<void>;
  onApplyWeek: () => Promise<void>;
  onLoadMoreSessions: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onSaveMilestone: (input: ChildMilestoneInput) => Promise<void>;
  onCreateDevicePairing: (displayName: string, platform: DevicePlatform) => Promise<DevicePairingResult>;
  onRevokeDevice: (deviceId: string) => Promise<void>;
  onUpdateProfile: (childName: string, gradeLevel: number, avatarFile?: File | null, removeAvatar?: boolean) => Promise<void>;
  onAddChild: (childName: string, gradeLevel: number) => Promise<AccountChild>;
  onSelectChild: (child: AccountChild) => void;
  onClearData?: () => Promise<void>;
  onSwitchToChild: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function ParentDashboard({
  data,
  accountName,
  accountEmail,
  children,
  childrenError,
  selectedChildId,
  currentSession,
  saving,
  loadingMore,
  error,
  onApprove,
  onAddGoal,
  onSaveSchedule,
  onGenerateWeek,
  onApplyWeek,
  onLoadMoreSessions,
  onRefresh,
  onMarkNotificationRead,
  onSaveMilestone,
  onCreateDevicePairing,
  onRevokeDevice,
  onUpdateProfile,
  onAddChild,
  onSelectChild,
  onClearData,
  onSwitchToChild,
  onLogout,
}: ParentDashboardProps) {
  const [tab, setTab] = useState<ParentTab>('today');
  const [selectedDay, setSelectedDay] = useState<DayKey>(getDayKey());
  const [goalOpen, setGoalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [childProfilesOpen, setChildProfilesOpen] = useState(false);
  const [scheduleSetupOpen, setScheduleSetupOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<LearningSessionRow | null>(null);

  const handleSelectEvent = (event: ScheduleEventRow) => {
    if (!isSelfStudyType(event.event_type)) return;
    const existing = data.sessions.find(
      (session) => session.schedule_event_id === event.id,
    ) ?? data.sessions.find(
      (session) => !session.schedule_event_id
        && session.title === event.title
        && session.subject === event.subject,
    );
    if (!existing) return;
    setSelectedSession(existing);
    setDetailsOpen(true);
  };

  const handleOpenDetails = (session: LearningSessionRow) => {
    setSelectedSession(session);
    setDetailsOpen(true);
  };

  const pendingCount = data.sessions.filter(s => s.status === 'awaiting_parent').length;
  const unreadCount = data.notifications.filter((notification) => !notification.is_read).length;
  const activeMilestone = data.milestones.find((milestone) => ['active', 'unlocked'].includes(milestone.status));

  if (scheduleSetupOpen) {
    return (
      <div className="app-shell min-h-screen app-background p-4 app-text-color sm:p-5">
        <ScheduleSetupPanel
          key={data.child.id}
          data={data}
          saving={saving}
          error={error}
          onBack={() => setScheduleSetupOpen(false)}
          onSave={onSaveSchedule}
        />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen app-background pb-28 app-text-color">
      <div className="p-4 sm:p-5">
        <ParentHeader
          childName={data.child.full_name}
          childGrade={data.child.grade_level}
          childAvatarPath={data.child.avatar_url}
          parentName={accountName}
          parentAvatarUrl={data.parent.avatar_url}
          notificationCount={unreadCount + pendingCount}
          onShowNotifications={() => setNotificationsOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenChildProfiles={() => setChildProfilesOpen(true)}
        />
        {tab === 'today' && (
          <TodayPanel
            data={data}
            session={currentSession}
            saving={saving}
            onApprove={onApprove}
            onOpenDetails={handleOpenDetails}
            onSelectEvent={handleSelectEvent}
            onSwitchToChild={onSwitchToChild}
            onOpenDevices={() => setDevicesOpen(true)}
            onOpenSetup={() => setScheduleSetupOpen(true)}
          />
        )}
        {tab === 'week' && (
          <WeekPanel
            data={data}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenSetup={() => setScheduleSetupOpen(true)}
            onRefresh={onRefresh}
          />
        )}
        {tab === 'plan' && (
          <PlanPanel
            data={data}
            saving={saving}
            onAddGoal={() => setGoalOpen(true)}
            onGenerate={onGenerateWeek}
            onApply={onApplyWeek}
            onEditMilestone={() => setMilestoneOpen(true)}
          />
        )}
        {tab === 'learning' && (
          <LearningPanel
            data={data}
            session={currentSession}
            loadingMore={loadingMore}
            onLoadMore={onLoadMoreSessions}
          />
        )}
        {tab === 'exceptions' && <ExceptionsPanel data={data} />}
        {error && <p className="mt-5 rounded-2xl app-red-soft p-3 text-center text-xs app-red-text">{error}</p>}
      </div>

      <ParentNav active={tab} onChange={setTab} />
      <AppSidebar
        open={menuOpen}
        mode="parent"
        accountName={accountName}
        accountEmail={accountEmail}
        childName={data.child.full_name || 'bé'}
        onClose={() => setMenuOpen(false)}
        onSwitchMode={onSwitchToChild}
        onLogout={onLogout}
      />
      <ChildProfileSheet
        open={childProfilesOpen}
        children={children}
        selectedChildId={selectedChildId}
        saving={saving}
        externalError={childrenError ?? error}
        onClose={() => setChildProfilesOpen(false)}
        onSelect={onSelectChild}
        onRename={onUpdateProfile}
        onAdd={onAddChild}
        onClearData={onClearData}
      />
      {goalOpen && <GoalModal saving={saving} onClose={() => setGoalOpen(false)} onSave={onAddGoal} />}
      {notificationsOpen && (
        <NotificationCenter data={data} saving={saving} onRead={onMarkNotificationRead} onClose={() => setNotificationsOpen(false)} />
      )}
      {milestoneOpen && (
        <MilestoneModal
          currentTitle={activeMilestone?.title}
          currentDescription={activeMilestone?.description}
          currentTarget={activeMilestone?.target_points}
          saving={saving}
          onSave={onSaveMilestone}
          onClose={() => setMilestoneOpen(false)}
        />
      )}
      {devicesOpen && (
        <DeviceManagementDialog
          key={data.child.id}
          data={data}
          saving={saving}
          onCreate={onCreateDevicePairing}
          onRevoke={onRevokeDevice}
          onClose={() => setDevicesOpen(false)}
        />
      )}
      {detailsOpen && (
        <SessionDetailsModal
          data={data}
          session={selectedSession || currentSession}
          saving={saving}
          onApprove={onApprove}
          onClose={() => { setDetailsOpen(false); setSelectedSession(null); }}
        />
      )}
    </div>
  );
}
