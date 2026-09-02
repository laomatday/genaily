import React, { useState, useEffect } from 'react';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import { OfflineIndicator } from '../../components/OfflineIndicator';

interface ChildAppProps {
  sessionStatus: string;
  onSubmitSession: () => void;
  onSwitchToParent: () => void;
}

export function ChildApp({ sessionStatus, onSubmitSession, onSwitchToParent }: ChildAppProps) {
  const [subView, setSubView] = useState<'home' | 'lock' | 'focus' | 'evidence' | 'result' | 'waiting' | 'unlocked'>(
    sessionStatus === 'awaiting_parent' ? 'waiting' : sessionStatus === 'approved' || sessionStatus === 'completed' ? 'unlocked' : 'home'
  );
  const [timerSec, setTimerSec] = useState(3600);
  const [paused, setPaused] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<boolean | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);

  useEffect(() => {
    let int: any = null;
    if (subView === 'focus' && !paused) {
      int = setInterval(() => {
        setTimerSec(s => (s > 0 ? s - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(int);
  }, [subView, paused]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-[460px] mx-auto min-h-screen bg-[#0E1118] text-white relative">
      {/* CHILD HOME */}
      {subView === 'home' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-sm overflow-hidden p-1">
                <img src="https://lh3.googleusercontent.com/d/1TTJ-7BMnAa6nMfNrMI1DavN64l2Y3VOP" alt="Logo" className="w-full h-full object-contain" style={{ transform: 'scale(0.67)' }} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#8A92A2] font-extrabold">Thứ Tư · 2/9</div>
                <b className="text-xl">Chào Pen 👋</b>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button onClick={onSwitchToParent} className="w-10 h-10 rounded-2xl bg-[#243C8F] text-white font-bold text-sm flex items-center justify-center shadow-md" title="Switch to Parent Mode">P</button>
            </div>
          </div>

          <div className="p-5 rounded-[26px] bg-gradient-to-br from-[#1E2536] to-[#151A24] border border-[#2B354D] mb-6 shadow-xl">
            <div className="text-[11px] uppercase tracking-wider text-[#69B7FF] font-extrabold mb-1">TIẾP THEO · 19:30</div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">🐍 Python</h2>
            <p className="text-xs text-[#AAB4C5] leading-relaxed mb-4">Lists & Loops · 60 phút<br/>Mục tiêu: 3 bài + quick-check</p>
            <button onClick={() => setSubView('lock')} className="w-full py-3.5 rounded-2xl bg-white text-[#151A24] font-extrabold text-xs shadow-lg">Bắt đầu buổi học</button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 text-xs text-[#AAB4C5]">
              <b>Nhịp hôm nay</b>
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-white font-bold">4 / 5</span>
            </div>
            <div className="grid gap-2.5">
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#687286] text-right">07:00</span>
                <div className="p-3.5 rounded-[20px] bg-white/5 border border-white/10">
                  <b className="text-sm block">🏫 Trường</b>
                  <small className="text-[#8A92A2] text-[11px]">Đã xong</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#687286] text-right">17:00</span>
                <div className="p-3.5 rounded-[20px] bg-white/5 border border-white/10">
                  <b className="text-sm block">🏀 Bóng rổ</b>
                  <small className="text-[#8A92A2] text-[11px]">Đã xong</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#687286] text-right">19:30</span>
                <div className="p-3.5 rounded-[20px] bg-[#19B7A5]/20 border border-[#19B7A5]/40 shadow-md">
                  <b className="text-sm block text-[#19B7A5]">🐍 Python</b>
                  <small className="text-[#AAB4C5] text-[11px]">60 phút · tiếp theo</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#687286] text-right">22:30</span>
                <div className="p-3.5 rounded-[20px] bg-white/5 border border-white/10">
                  <b className="text-sm block">🌙 Ngủ</b>
                  <small className="text-[#8A92A2] text-[11px]">Đúng nhịp</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STUDY LOCK SCREEN */}
      {subView === 'lock' && (
        <div className="min-h-screen flex flex-col p-5 justify-between">
          <div className="flex justify-between items-center">
            <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-[#D7DDEA]">STUDY LOCK</span>
            <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-[#D7DDEA]">60 phút</span>
          </div>
          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-22 h-22 rounded-3xl bg-gradient-to-br from-[#3152D2] via-[#2A79CB] to-[#1EB7A6] flex items-center justify-center text-4xl shadow-2xl mb-6">🔒</div>
            <h1 className="text-3xl font-black tracking-tight mb-3">Đến giờ Python.</h1>
            <p className="text-[#AAB4C5] text-sm leading-relaxed max-w-[300px]">App gây xao nhãng tạm ẩn. Chỉ những công cụ cần cho buổi học được giữ lại.</p>
            <div className="flex gap-2 justify-center flex-wrap mt-6">
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">🧮 Máy tính</span>
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">📖 Từ điển</span>
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">💻 Python IDE</span>
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">☎️ Ba/Mẹ</span>
            </div>
          </div>
          <div className="grid gap-2.5">
            <button onClick={() => setSubView('focus')} className="w-full py-4 rounded-2xl bg-white text-[#10141D] font-black text-sm shadow-xl">Vào Focus</button>
            <button onClick={() => alert('Đã gửi yêu cầu nghỉ 10 phút tới phụ huynh')} className="w-full py-4 rounded-2xl bg-white/10 text-[#E6EBF4] font-bold text-sm">Xin nghỉ 10 phút</button>
          </div>
        </div>
      )}

      {/* FOCUS TIMER SCREEN */}
      {subView === 'focus' && (
        <div className="min-h-screen flex flex-col p-5 justify-between">
          <div className="flex justify-between items-center text-xs text-[#ABB4C5]">
            <span>PYTHON · LISTS & LOOPS</span>
            <span>🔒 ON</span>
          </div>
          <div className="flex flex-col items-center text-center my-auto">
            <div className="text-[74px] font-black tracking-tighter mb-2">{formatTime(timerSec)}</div>
            <div className="text-[#B8C0CF] text-sm mb-6">3 bài tập · quick-check cuối buổi</div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-[310px] text-xs text-[#DDE3EC] leading-relaxed">
              Mục tiêu: dùng vòng lặp để duyệt list và giải đúng ít nhất 4/5 câu kiểm tra nhanh.
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
            <button onClick={() => setPaused(!paused)} className="py-4 rounded-2xl bg-white/10 text-white font-bold text-xs">{paused ? 'Tiếp tục' : 'Tạm dừng'}</button>
            <button onClick={() => setSubView('evidence')} className="py-4 rounded-2xl bg-white text-[#151A24] font-black text-xs shadow-xl">Hoàn thành</button>
          </div>
        </div>
      )}

      {/* EVIDENCE & QUIZ SCREEN */}
      {subView === 'evidence' && (
        <div className="p-4 sm:p-5 bg-[#F7F9FC] text-[#151A24] min-h-screen">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setSubView('focus')} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold">←</button>
            <b className="text-base">Xác nhận buổi học</b>
            <span className="px-3 py-1 rounded-full bg-[#EEF3FF] text-[#243C8F] text-xs font-bold">52' focus</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Cho app thấy con đã làm gì.</h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">Không cần chấm công. Chỉ một bằng chứng ngắn để completion có ý nghĩa.</p>

          <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <b>1 · Ảnh bài làm</b>
              <span className="px-2.5 py-1 rounded-full bg-[#EEF3FF] text-[#243C8F] text-xs font-bold">Tùy chọn</span>
            </div>
            <div className="w-full aspect-[16/10] rounded-2xl bg-[#EEF2F7] flex items-center justify-center text-[#8D96A7] text-xs font-medium mb-3">
              Chưa có ảnh (mock upload)
            </div>
            <button onClick={() => alert('Đã đính kèm ảnh bài làm Python')} className="w-full py-3 rounded-2xl bg-[#F0F3F7] font-bold text-xs">Chụp / chọn ảnh</button>
          </div>

          <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <b>2 · Quick-check</b>
              <span className="px-2.5 py-1 rounded-full bg-[#EEF3FF] text-[#243C8F] text-xs font-bold">1 câu mẫu</span>
            </div>
            <p className="text-xs text-[#151A24] leading-relaxed mb-3">Vòng lặp nào phù hợp nhất để duyệt từng phần tử trong một list Python?</p>
            <div className="grid gap-2 mb-4">
              <button onClick={() => setQuizAnswer(false)} className={`p-3 rounded-2xl border text-left text-xs font-medium ${quizAnswer === false ? 'border-[#8FB8FF] bg-[#EEF5FF] text-[#243C8F] font-bold' : 'border-[#E9EDF4] bg-white'}`}>while True</button>
              <button onClick={() => setQuizAnswer(true)} className={`p-3 rounded-2xl border text-left text-xs font-medium ${quizAnswer === true ? 'border-[#8FB8FF] bg-[#EEF5FF] text-[#243C8F] font-bold' : 'border-[#E9EDF4] bg-white'}`}>for item in my_list</button>
              <button onClick={() => setQuizAnswer(false)} className={`p-3 rounded-2xl border text-left text-xs font-medium ${quizAnswer === false ? 'border-[#8FB8FF] bg-[#EEF5FF] text-[#243C8F] font-bold' : 'border-[#E9EDF4] bg-white'}`}>if item in my_list</button>
            </div>
            <button onClick={() => {
              if (quizAnswer === null) { alert('Chọn một đáp án quick-check trước nhé'); return; }
              setSubView('result');
            }} className="w-full py-3.5 rounded-2xl bg-[#151A24] text-white font-bold text-xs shadow-md">Gửi & đánh giá</button>
          </div>
        </div>
      )}

      {/* RESULT & REFLECTION */}
      {subView === 'result' && (
        <div className="p-4 sm:p-5 bg-[#F7F9FC] text-[#151A24] min-h-screen">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#243C8F] text-white flex items-center justify-center font-black">g</div>
              <b className="text-sm">genAi Family</b>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#E8F8F4] text-[#0D8A79] text-xs font-bold">Sẵn sàng gửi</span>
          </div>

          <div className="text-center py-6">
            <div className="text-5xl mb-2">✨</div>
            <h2 className="text-2xl font-black tracking-tight mb-1">Con đã xong.</h2>
            <p className="text-xs text-[#7B8496] leading-relaxed">Kiểm tra lại một chút rồi gửi cho ba/mẹ xác nhận. Điện thoại vẫn ở Study Lock cho đến khi được duyệt.</p>
          </div>

          <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <b>Kết quả</b>
              <span className="px-2.5 py-1 rounded-full bg-[#E8F8F4] text-[#0D8A79] text-xs font-bold">{quizAnswer ? 'Vững 5/5' : 'Cần xem'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">52'</strong>
                <span className="text-[10px] text-[#7B8496]">focus thật</span>
              </div>
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">3/4</strong>
                <span className="text-[10px] text-[#7B8496]">bài xong</span>
              </div>
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">{quizAnswer ? '5/5' : '3/5'}</strong>
                <span className="text-[10px] text-[#7B8496]">quick-check</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <b className="text-xs font-bold text-[#7A8497] block mb-2.5">Buổi này thấy sao?</b>
            <div className="grid grid-cols-3 gap-2">
              {['easy', 'ok', 'hard'].map(r => (
                <button key={r} onClick={() => setReflection(r)} className={`p-3.5 rounded-2xl border text-center transition ${reflection === r ? 'border-[#8FB8FF] bg-[#EEF5FF] font-bold text-[#243C8F]' : 'border-[#E9EDF4] bg-white'}`}>
                  <span className="text-2xl block mb-1">{r === 'easy' ? '😄' : r === 'ok' ? '🙂' : '😵'}</span>
                  <span className="text-xs">{r === 'easy' ? 'Dễ' : r === 'ok' ? 'Ổn' : 'Khó'}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => {
            if (!reflection) { alert('Chọn cảm nhận của buổi học trước nhé'); return; }
            onSubmitSession();
            setSubView('waiting');
          }} className="w-full py-4 rounded-2xl bg-[#151A24] text-white font-black text-sm shadow-xl">Gửi ba/mẹ xác nhận</button>
        </div>
      )}

      {/* WAITING APPROVAL SCREEN */}
      {subView === 'waiting' && (
        <div className="min-h-screen flex flex-col p-5 justify-between">
          <div className="flex justify-between items-center">
            <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-[#D7DDEA]">FOCUS CHECKPOINT</span>
            <span className="px-3 py-1 rounded-full bg-[#19B7A5]/20 text-xs font-bold text-[#19B7A5]">ĐÃ GỬI ✓</span>
          </div>
          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-22 h-22 rounded-3xl bg-gradient-to-br from-[#19B7A5] to-[#243C8F] flex items-center justify-center text-4xl shadow-2xl mb-6">✓</div>
            <h1 className="text-3xl font-black tracking-tight mb-3">Đã gửi cho ba/mẹ.</h1>
            <p className="text-[#AAB4C5] text-sm leading-relaxed max-w-[300px]">Con đã hoàn thành phần của mình. Điện thoại vẫn ở Study Lock trong lúc chờ xác nhận mở khóa.</p>
            <div className="flex gap-2 justify-center flex-wrap mt-6">
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">☎️ Gọi Ba/Mẹ</span>
              <span className="px-3 py-2 rounded-xl bg-white/10 text-xs text-[#D7DDEA]">🚨 Khẩn cấp</span>
            </div>
          </div>
          <div className="grid gap-2.5">
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 text-xs text-[#C9D1DF] text-center">
              Ba/mẹ đã nhận thông báo · <b>vừa xong</b>
            </div>
            <button onClick={onSwitchToParent} className="w-full py-4 rounded-2xl bg-white/10 text-[#E6EBF4] font-bold text-sm">Mở mô phỏng thiết bị ba/mẹ</button>
          </div>
        </div>
      )}

      {/* UNLOCKED SCREEN */}
      {subView === 'unlocked' && (
        <div className="p-4 sm:p-5 bg-[#F7F9FC] text-[#151A24] min-h-screen">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#243C8F] text-white flex items-center justify-center font-black">g</div>
              <b className="text-sm">genAi Family</b>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#E8F8F4] text-[#0D8A79] text-xs font-bold">Đã mở khóa</span>
          </div>

          <div className="text-center py-6">
            <div className="text-5xl mb-2 text-[#0D8A79]">✓</div>
            <h2 className="text-2xl font-black tracking-tight mb-1">Ba đã xác nhận.</h2>
            <p className="text-xs text-[#7B8496] leading-relaxed">Buổi Python đã được chốt. Study Lock đã tắt và điện thoại được mở lại.</p>
          </div>

          <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <b>Python · Lists & Loops</b>
              <span className="px-2.5 py-1 rounded-full bg-[#E8F8F4] text-[#0D8A79] text-xs font-bold">Hoàn thành</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">52'</strong>
                <span className="text-[10px] text-[#7B8496]">focus</span>
              </div>
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">3/4</strong>
                <span className="text-[10px] text-[#7B8496]">bài</span>
              </div>
              <div className="p-3 bg-[#F8F9FC] rounded-xl border border-[#E9EDF4]">
                <strong className="block text-base">5/5</strong>
                <span className="text-[10px] text-[#7B8496]">quick-check</span>
              </div>
            </div>
          </div>

          <button onClick={() => setSubView('home')} className="w-full py-4 rounded-2xl bg-[#151A24] text-white font-black text-sm shadow-xl">Về Hôm nay</button>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
