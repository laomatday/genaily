import React, { useState } from 'react';
import { StatusBadge } from '../../components/DesignSystem';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import { OfflineIndicator } from '../../components/OfflineIndicator';

interface ParentDashboardProps {
  sessionStatus: string;
  onApprove: () => void;
  onSwitchToChild: () => void;
}

export function ParentDashboard({ sessionStatus, onApprove, onSwitchToChild }: ParentDashboardProps) {
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'plan' | 'learning' | 'exceptions'>('today');
  const [selectedDay, setSelectedDay] = useState('wed');
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [approvalSheetOpen, setApprovalSheetOpen] = useState(false);

  const isPending = sessionStatus === 'awaiting_parent';
  const isApproved = sessionStatus === 'approved' || sessionStatus == 'completed';

  return (
    <div className="max-w-[460px] mx-auto min-h-screen bg-[#F7F9FC] text-[#151A24] relative pb-28">
      {/* TODAY SCREEN */}
      {activeTab === 'today' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white border border-[#E9EDF4] flex items-center justify-center shadow-sm overflow-hidden p-1">
                <img src="https://lh3.googleusercontent.com/d/1TTJ-7BMnAa6nMfNrMI1DavN64l2Y3VOP" alt="Logo" className="w-full h-full object-contain" style={{ transform: 'scale(0.67)' }} />
              </div>
              <div>
                <b className="text-base">genAi Family</b>
                <small className="block text-[#7B8496] text-[11px]">Learning Autopilot</small>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button onClick={onSwitchToChild} className="w-10 h-10 rounded-2xl bg-[#EAF2FF] text-[#243C8F] font-bold text-sm flex items-center justify-center shadow-sm" title="Switch to Child Mode">P</button>
            </div>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            {isPending ? 'Pen đang chờ anh xác nhận.' : isApproved ? 'Hôm nay, mọi thứ ổn.' : 'Hôm nay, mọi thứ ổn.'}
          </h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">
            {isPending 
              ? 'Buổi Python đã xong. Điện thoại của con vẫn khóa Study Lock cho đến khi được duyệt.' 
              : 'Pen đang theo đúng nhịp. Autopilot tự quản lý Study Lock và lịch học mà không cần can thiệp thủ công.'}
          </p>

          <div className="p-4 rounded-[26px] bg-white border border-[#E9EDF4] shadow-sm flex items-center gap-4 mb-5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${isPending ? 'bg-[#FFF4D8]' : 'bg-[#E8F8F4]'}`}>
              {isPending ? '🔒' : '✓'}
            </div>
            <div className="flex-1">
              <b className="text-sm block">{isPending ? 'Focus Checkpoint đang chờ' : 'Autopilot đang chạy'}</b>
              <p className="text-xs text-[#7B8496] mt-0.5">{isPending ? '52 phút focus · kết quả đã gửi từ thiết bị Pen' : '4 hoạt động đã lên lịch · Study Lock sẵn sàng'}</p>
            </div>
            <span className={`text-xs font-bold ${isPending ? 'text-[#9A6800]' : 'text-[#0D8A79]'}`}>{isPending ? 'Cần duyệt' : 'Ổn'}</span>
          </div>

          {isPending && (
            <div className="mb-6 p-5 rounded-[26px] bg-gradient-to-br from-[#EEF3FF] via-[#F7F9FF] to-[#EAF9F5] border border-[#D5E3FF] shadow-sm">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-[#65718B] mb-1">PYTHON · FOCUS CHECKPOINT</div>
              <h2 className="text-xl font-bold tracking-tight mb-2">Pen đã hoàn thành.</h2>
              <p className="text-xs text-[#647087] leading-relaxed mb-4">
                <b>52 phút focus · 3/4 bài · quick-check 5/5</b><br/>Điện thoại của con vẫn đang ở Study Lock và chờ ba/mẹ xác nhận.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setApprovalSheetOpen(true)} className="flex-1 py-3 px-4 rounded-2xl bg-white border border-[#E9EDF4] font-bold text-xs shadow-sm">Xem nhanh</button>
                <button onClick={onApprove} className="flex-1 py-3 px-4 rounded-2xl bg-[#243C8F] text-white font-bold text-xs shadow-md">Xác nhận & mở khóa</button>
              </div>
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <b className="text-sm">Đang diễn ra</b>
              <button onClick={onSwitchToChild} className="text-[#243C8F] font-bold text-xs bg-transparent border-0 cursor-pointer">Xem phía trẻ →</button>
            </div>
            <div className="p-5 rounded-[26px] bg-gradient-to-br from-[#EEF3FF] via-[#F7F9FF] to-[#EAF9F5] border border-[#D5E3FF] shadow-sm">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-[#65718B] mb-1">
                {isPending ? '20:22 · PYTHON HOÀN THÀNH' : isApproved ? '20:22 · PYTHON HOÀN THÀNH' : '19:30–20:30 · Python'}
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-2">
                {isPending ? 'Chờ xác nhận mở khóa' : isApproved ? 'Đã hoàn thành' : 'Lists & Loops'}
              </h2>
              <p className="text-xs text-[#647087] leading-relaxed mb-4">
                {isPending 
                  ? 'Pen đã gửi kết quả. Study Lock vẫn đang giữ trên thiết bị của con.'
                  : isApproved 
                  ? '52 phút focus · Parent confirmed · thiết bị đã mở khóa.'
                  : 'Study Lock bật tự động. Mục tiêu: hoàn thành 3 bài và quick-check cuối buổi.'}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setApprovalSheetOpen(true)} className="flex-1 py-3 px-4 rounded-2xl bg-white border border-[#E9EDF4] font-bold text-xs shadow-sm">Chi tiết</button>
                <button onClick={onSwitchToChild} className="flex-1 py-3 px-4 rounded-2xl bg-[#151A24] text-white font-bold text-xs shadow-md">Mở Child Mode</button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <b className="text-sm">Hôm nay</b>
              <StatusBadge status="success" label="4 / 5 đúng nhịp" />
            </div>
            <div className="grid gap-2.5">
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#8A92A2] text-right font-medium">07:00</span>
                <div className="p-3.5 rounded-[20px] bg-[#EAF2FF] border border-transparent">
                  <b className="text-sm block">🏫 Trường</b>
                  <small className="text-[#687286] text-[11px] mt-0.5 block">07:00–16:30 · Hoàn thành</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#8A92A2] text-right font-medium">17:00</span>
                <div className="p-3.5 rounded-[20px] bg-[#FFECEA] border border-transparent">
                  <b className="text-sm block">🏀 Bóng rổ</b>
                  <small className="text-[#687286] text-[11px] mt-0.5 block">17:00–18:00 · Hoàn thành</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#8A92A2] text-right font-medium">19:30</span>
                <div className="p-3.5 rounded-[20px] bg-[#E8F8F4] border border-[#19B7A5]/30 shadow-sm ring-2 ring-[#19B7A5]/10">
                  <b className="text-sm block">🐍 Python · {isPending ? 'chờ xác nhận' : isApproved ? 'hoàn thành' : 'đang diễn ra'}</b>
                  <small className="text-[#687286] text-[11px] mt-0.5 block">Lists & Loops · Study Lock {isApproved ? 'OFF' : 'ON'}</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#8A92A2] text-right font-medium">20:45</span>
                <div className="p-3.5 rounded-[20px] bg-[#F1EAFE] border border-transparent">
                  <b className="text-sm block">🇬🇧 English</b>
                  <small className="text-[#687286] text-[11px] mt-0.5 block">45 phút · self-study</small>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                <span className="text-xs text-[#8A92A2] text-right font-medium">22:30</span>
                <div className="p-3.5 rounded-[20px] bg-[#EFF2F6] border border-transparent">
                  <b className="text-sm block">🌙 Ngủ</b>
                  <small className="text-[#687286] text-[11px] mt-0.5 block">Mục tiêu 22:30</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEEKLY PLAN SCREEN */}
      {activeTab === 'week' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setActiveTab('today')} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold">←</button>
            <b className="text-base">Lịch tuần</b>
            <StatusBadge status="info" label="31/8–6/9" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Nhịp tuần của Pen</h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">Một tuần cân bằng giữa trường, học tập, vận động và nghỉ. Autopilot chỉ can thiệp khi lịch bắt đầu quá tải.</p>
          
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            <div className="p-3.5 rounded-[20px] bg-white border border-[#E9EDF4] shadow-sm">
              <strong className="text-lg block tracking-tight">12h</strong>
              <span className="text-[10.5px] text-[#7B8496] mt-0.5 block">học mục tiêu</span>
            </div>
            <div className="p-3.5 rounded-[20px] bg-white border border-[#E9EDF4] shadow-sm">
              <strong className="text-lg block tracking-tight">4.5h</strong>
              <span className="text-[10.5px] text-[#7B8496] mt-0.5 block">vận động</span>
            </div>
            <div className="p-3.5 rounded-[20px] bg-white border border-[#E9EDF4] shadow-sm">
              <strong className="text-lg block tracking-tight">2</strong>
              <span className="text-[10.5px] text-[#7B8496] mt-0.5 block">ngày tải cao</span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 mb-5">
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, idx) => {
              const dates = ['31', '1', '2', '3', '4', '5', '6'];
              const names = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
              const isSel = selectedDay === d;
              return (
                <button key={d} onClick={() => setSelectedDay(d)} className={`min-w-[58px] border rounded-[18px] p-2.5 text-center transition ${isSel ? 'bg-[#151A24] border-[#151A24] text-white shadow-md' : 'bg-white border-[#E9EDF4] text-[#778196]'}`}>
                  <b className="block text-[11px]">{names[idx]}</b>
                  <span className={`block text-[17px] font-black mt-0.5 ${isSel ? 'text-white' : 'text-[#151A24]'}`}>{dates[idx]}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3">
            <div className={`p-4 rounded-[24px] bg-white border ${selectedDay === 'wed' ? 'border-[#C7D7FF] shadow-md' : 'border-[#E9EDF4]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-[14px] bg-[#F1F4F8] flex flex-col items-center justify-center text-center">
                    <b className="text-sm leading-none">2</b>
                    <small className="text-[9px] text-[#7B8496] mt-0.5">09</small>
                  </div>
                  <div>
                    <b className="text-sm block">Thứ Tư · Hôm nay</b>
                    <small className="text-[11px] text-[#7B8496]">Python là block chính</small>
                  </div>
                </div>
                <span className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full bg-[#EEF3FF] text-[#243C8F]">Vừa</span>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-[40px_8px_1fr_auto] gap-2 items-center p-2 rounded-xl bg-[#F8F9FC]">
                  <span className="text-[10px] text-[#8A92A2] text-right">07:00</span>
                  <div className="w-2 h-2 rounded-full bg-[#69B7FF]"></div>
                  <b className="text-xs">Trường</b>
                  <span className="text-[10px] text-[#7E8798]">9h30</span>
                </div>
                <div className="grid grid-cols-[40px_8px_1fr_auto] gap-2 items-center p-2 rounded-xl bg-[#F8F9FC]">
                  <span className="text-[10px] text-[#8A92A2] text-right">17:00</span>
                  <div className="w-2 h-2 rounded-full bg-[#EF8B7A]"></div>
                  <b className="text-xs">Bóng rổ</b>
                  <span className="text-[10px] text-[#7E8798]">60'</span>
                </div>
                <div className="grid grid-cols-[40px_8px_1fr_auto] gap-2 items-center p-2 rounded-xl bg-[#F8F9FC]">
                  <span className="text-[10px] text-[#8A92A2] text-right">19:30</span>
                  <div className="w-2 h-2 rounded-full bg-[#19B7A5]"></div>
                  <b className="text-xs">Python · Lists & Loops</b>
                  <span className="text-[10px] text-[#7E8798]">60'</span>
                </div>
                <div className="grid grid-cols-[40px_8px_1fr_auto] gap-2 items-center p-2 rounded-xl bg-[#F8F9FC]">
                  <span className="text-[10px] text-[#8A92A2] text-right">20:45</span>
                  <div className="w-2 h-2 rounded-full bg-[#9B7AE8]"></div>
                  <b className="text-xs">English</b>
                  <span className="text-[10px] text-[#7E8798]">45'</span>
                </div>
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#EEF1F5] text-[10.5px] text-[#7B8496]">
                <span>Học 1h45</span>
                <span>Study Lock 19:30</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLAN / SMART WEEK */}
      {activeTab === 'plan' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setActiveTab('today')} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold">←</button>
            <b className="text-base">Kế hoạch tuần</b>
            <button onClick={() => setGoalSheetOpen(true)} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold text-lg">＋</button>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Autopilot tuần này</h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">Đặt mục tiêu. Hệ thống tự xếp phần tự học còn thiếu quanh lịch trường, học thêm và sinh hoạt.</p>

          <div className="grid grid-cols-2 bg-[#EEF1F5] p-1 rounded-2xl mb-6">
            <button className="py-2.5 rounded-xl bg-white font-bold text-xs shadow-sm">Mục tiêu</button>
            <button onClick={() => setActiveTab('exceptions')} className="py-2.5 rounded-xl bg-transparent font-bold text-xs text-[#6F7889]">Ngoại lệ</button>
          </div>

          <div className="grid gap-3">
            <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] flex items-center justify-between shadow-sm">
              <div>
                <b className="text-sm">🐍 Python</b>
                <small className="block text-[#7B8496] text-xs mt-1">2 buổi đã xếp · 60 phút/buổi</small>
                <div className="w-36 h-1.5 bg-[#EDF0F5] rounded-full mt-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#243C8F] to-[#19B7A5] w-3/4"></div>
                </div>
              </div>
              <span className="font-black text-[#243C8F] text-base">3 / 4h</span>
            </div>
            <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] flex items-center justify-between shadow-sm">
              <div>
                <b className="text-sm">➗ Toán</b>
                <small className="block text-[#7B8496] text-xs mt-1">Học thêm đã tính vào quota</small>
                <div className="w-36 h-1.5 bg-[#EDF0F5] rounded-full mt-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#243C8F] to-[#19B7A5] w-full"></div>
                </div>
              </div>
              <span className="font-black text-[#243C8F] text-base">4 / 4h</span>
            </div>
            <div className="p-4 rounded-[24px] bg-white border border-[#E9EDF4] flex items-center justify-between shadow-sm">
              <div>
                <b className="text-sm">🇬🇧 English</b>
                <small className="block text-[#7B8496] text-xs mt-1">Còn 60 phút cần xếp</small>
                <div className="w-36 h-1.5 bg-[#EDF0F5] rounded-full mt-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#243C8F] to-[#19B7A5] w-3/4"></div>
                </div>
              </div>
              <span className="font-black text-[#243C8F] text-base">3 / 4h</span>
            </div>
          </div>

          <div className="mt-6 p-5 rounded-[26px] bg-white border border-[#E9EDF4] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <b>Smart Week Planner</b>
              <StatusBadge status="info" label="1 thay đổi" />
            </div>
            <p className="text-xs text-[#53617A] leading-relaxed mb-4">Thứ Năm đang hơi nặng. Smart Week đề xuất chuyển 45 phút English từ 20:45 T5 sang 09:00 T7 và giữ nguyên bóng rổ.</p>
            <div className="flex gap-2">
              <button className="flex-1 py-3 rounded-2xl bg-[#F0F3F7] font-bold text-xs">Bỏ qua</button>
              <button onClick={() => alert('Đã áp dụng Smart Week')} className="flex-1 py-3 rounded-2xl bg-[#243C8F] text-white font-bold text-xs">Áp dụng</button>
            </div>
          </div>
        </div>
      )}

      {/* LEARNING / INSIGHT DOMAIN */}
      {activeTab === 'learning' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setActiveTab('today')} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold">←</button>
            <b className="text-base">Học tập & Mastery</b>
            <div className="w-10 h-10 rounded-2xl bg-[#EAF2FF] text-[#243C8F] font-bold text-sm flex items-center justify-center">P</div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Con đang học gì?</h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">Không chỉ thời gian. Đây là nội dung, bằng chứng và mức độ hiểu thực tế.</p>

          <div className="p-5 rounded-[26px] bg-white border border-[#E9EDF4] shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <b>Python · Lists & Loops</b>
              <StatusBadge status="success" label="Đang học" />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-3 rounded-2xl bg-[#F8F9FC] border border-[#E9EDF4]">
                <strong className="text-lg block">52'</strong>
                <span className="text-[10.5px] text-[#7B8496]">focus</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#F8F9FC] border border-[#E9EDF4]">
                <strong className="text-lg block">3/4</strong>
                <span className="text-[10.5px] text-[#7B8496]">bài</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#F8F9FC] border border-[#E9EDF4]">
                <strong className="text-lg block">4/5</strong>
                <span className="text-[10.5px] text-[#7B8496]">quick-check</span>
              </div>
            </div>
            <div className="grid gap-2.5 pt-3 border-t border-[#EEF1F5]">
              <div className="flex items-center gap-3 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-[#19B7A5]"></div><span>List cơ bản — vững</span></div>
              <div className="flex items-center gap-3 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-[#19B7A5]"></div><span>for loop — vững</span></div>
              <div className="flex items-center gap-3 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-[#F3B64C]"></div><span>nested loop — cần luyện thêm</span></div>
            </div>
          </div>

          <div className="p-5 rounded-[26px] bg-white border border-[#E9EDF4] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <b>Learning Memory</b>
              <StatusBadge status="info" label="4 tuần" />
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E9EDF4] text-xs text-[#53617A] leading-relaxed">
              Pen làm Python tốt nhất vào sáng cuối tuần. Các buổi sau 21:00 có completion thấp hơn khoảng 26%. Autopilot tự động dời khung giờ học nặng sang khung giờ năng suất cao.
            </div>
          </div>
        </div>
      )}

      {/* EXCEPTIONS / PARENT INBOX */}
      {activeTab === 'exceptions' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setActiveTab('today')} className="w-10 h-10 rounded-2xl border border-[#E9EDF4] bg-white flex items-center justify-center font-bold">←</button>
            <b className="text-base">Ngoại lệ & Inbox</b>
            <div className="w-10 h-10 rounded-2xl bg-[#EAF2FF] text-[#243C8F] font-bold text-sm flex items-center justify-center">P</div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            {isPending ? '1 việc cần anh xử lý' : 'Chưa có gì cần anh xử lý.'}
          </h1>
          <p className="text-[#7B8496] text-sm leading-relaxed mb-5">Autopilot chỉ kéo anh vào khi có một quyết định thực sự cần phụ huynh.</p>

          {isPending ? (
            <div className="p-5 rounded-[26px] bg-[#FFF7E3] border border-[#F5E7BA] mb-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <b>Python · cần 4 phút cùng con</b>
                <StatusBadge status="warning" label="Cần chú ý" />
              </div>
              <p className="text-xs text-[#7B6A3B] leading-relaxed mb-4">Quick-check chưa đạt và Pen đánh dấu buổi học khó. Gợi ý: hỏi con “nested loop khác loop thường ở đâu?” — không cần giải hộ.</p>
              <div className="flex gap-2">
                <button onClick={() => alert('Đã theo dõi thêm 1 buổi')} className="flex-1 py-3 rounded-2xl bg-white border border-[#E6D49D] font-bold text-xs">Theo dõi thêm</button>
                <button onClick={() => alert('Đã tạo check-in 4 phút tối nay')} className="flex-1 py-3 rounded-2xl bg-[#243C8F] text-white font-bold text-xs">Học cùng 4 phút</button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-[26px] bg-white border border-[#E9EDF4] flex items-center gap-4 mb-5 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#E8F8F4] flex items-center justify-center text-xl text-[#0D8A79]">✓</div>
              <div>
                <b className="text-sm block">Mọi thứ ổn</b>
                <p className="text-xs text-[#7B8496] mt-0.5">Không có session bị bỏ, không có xung đột lịch và chưa có nội dung mắc lặp lại.</p>
              </div>
            </div>
          )}

          <div className="p-5 rounded-[26px] bg-white border border-[#E9EDF4] shadow-sm">
            <b>Nguyên tắc thông báo</b>
            <p className="text-xs text-[#53617A] mt-2 leading-relaxed">Chỉ báo khi: session bị bỏ đáng kể · trẻ xin trợ giúp · một lỗi học tập lặp lại · lịch quá tải · cần duyệt điều chỉnh.</p>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-3 w-[min(430px,calc(100%-20px))] bg-white/94 backdrop-blur-md border border-[#E9EDF4] shadow-2xl rounded-[22px] p-1.5 grid grid-cols-5 z-30">
        <button onClick={() => setActiveTab('today')} className={`py-2 rounded-2xl text-[10.5px] font-medium flex flex-col items-center gap-0.5 ${activeTab === 'today' ? 'bg-[#EEF3FF] text-[#243C8F] font-bold' : 'text-[#80899A]'}`}>
          <span className="text-lg">⌂</span>Hôm nay
        </button>
        <button onClick={() => setActiveTab('week')} className={`py-2 rounded-2xl text-[10.5px] font-medium flex flex-col items-center gap-0.5 ${activeTab === 'week' ? 'bg-[#EEF3FF] text-[#243C8F] font-bold' : 'text-[#80899A]'}`}>
          <span className="text-lg">▦</span>Lịch tuần
        </button>
        <button onClick={() => setActiveTab('plan')} className={`py-2 rounded-2xl text-[10.5px] font-medium flex flex-col items-center gap-0.5 ${activeTab === 'plan' ? 'bg-[#EEF3FF] text-[#243C8F] font-bold' : 'text-[#80899A]'}`}>
          <span className="text-lg">◫</span>Kế hoạch
        </button>
        <button onClick={() => setActiveTab('learning')} className={`py-2 rounded-2xl text-[10.5px] font-medium flex flex-col items-center gap-0.5 ${activeTab === 'learning' ? 'bg-[#EEF3FF] text-[#243C8F] font-bold' : 'text-[#80899A]'}`}>
          <span className="text-lg">◎</span>Học tập
        </button>
        <button onClick={() => setActiveTab('exceptions')} className={`py-2 rounded-2xl text-[10.5px] font-medium flex flex-col items-center gap-0.5 ${activeTab === 'exceptions' ? 'bg-[#EEF3FF] text-[#243C8F] font-bold' : 'text-[#80899A]'}`}>
          <span className="text-lg">!</span>Ngoại lệ
        </button>
      </div>

      <OfflineIndicator />

      {/* APPROVAL SHEET MODAL */}
      {approvalSheetOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setApprovalSheetOpen(false)}>
          <div className="w-full max-w-[460px] bg-white rounded-t-[30px] p-5 pb-8 max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-1.5 bg-[#DDE2EA] rounded-full mx-auto mb-4"></div>
            <div className="flex items-center justify-between mb-4">
              <b className="text-base">Pen đã hoàn thành Python</b>
              <button onClick={() => setApprovalSheetOpen(false)} className="text-[#243C8F] font-bold text-xs">Đóng</button>
            </div>
            <p className="text-xs text-[#53617A] leading-relaxed mb-4">Điện thoại của Pen vẫn đang ở Study Lock. Anh có thể duyệt ngay hoặc xem nhanh kết quả trước khi mở khóa.</p>
            <div className="p-4 rounded-[22px] bg-[#F8F9FC] border border-[#E9EDF4] mb-4">
              <div className="flex items-center justify-between mb-3">
                <b>Lists & Loops</b>
                <span className="px-2.5 py-1 rounded-full bg-[#E8F8F4] text-[#0D8A79] text-xs font-bold">52' focus</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-white rounded-xl border border-[#E9EDF4]">
                  <strong className="block text-base">3/4</strong>
                  <span className="text-[10px] text-[#7B8496]">bài</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E9EDF4]">
                  <strong className="block text-base">5/5</strong>
                  <span className="text-[10px] text-[#7B8496]">quick-check</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E9EDF4]">
                  <strong className="block text-base">🙂</strong>
                  <span className="text-[10px] text-[#7B8496]">cảm nhận</span>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <button onClick={() => { setApprovalSheetOpen(false); onApprove(); }} className="w-full py-3.5 rounded-2xl bg-[#243C8F] text-white font-bold text-sm shadow-md">Xác nhận & mở khóa</button>
              <button onClick={() => { setApprovalSheetOpen(false); alert('Đã gửi thêm 10 phút Focus tới Pen'); }} className="w-full py-3.5 rounded-2xl bg-white border border-[#E9EDF4] font-bold text-sm">Thêm 10 phút</button>
            </div>
          </div>
        </div>
      )}

      {/* GOAL SHEET MODAL */}
      {goalSheetOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setGoalSheetOpen(false)}>
          <div className="w-full max-w-[460px] bg-white rounded-t-[30px] p-5 pb-8 max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-1.5 bg-[#DDE2EA] rounded-full mx-auto mb-4"></div>
            <div className="flex items-center justify-between mb-4">
              <b className="text-base">Thêm mục tiêu học tập</b>
              <button onClick={() => setGoalSheetOpen(false)} className="text-[#243C8F] font-bold text-xs">Đóng</button>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="text-xs text-[#7A8497] font-bold block mb-1">Môn học</label>
                <select className="w-full h-12 bg-[#F0F3F7] rounded-2xl px-3 border-0 text-sm">
                  <option>Python</option>
                  <option>Toán</option>
                  <option>English</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[#7A8497] font-bold block mb-1">Mục tiêu / tuần</label>
                  <input className="w-full h-12 bg-[#F0F3F7] rounded-2xl px-3 border-0 text-sm" defaultValue="4 giờ" />
                </div>
                <div>
                  <label className="text-xs text-[#7A8497] font-bold block mb-1">Mỗi buổi</label>
                  <input className="w-full h-12 bg-[#F0F3F7] rounded-2xl px-3 border-0 text-sm" defaultValue="60 phút" />
                </div>
              </div>
              <button onClick={() => { setGoalSheetOpen(false); alert('Đã lưu mục tiêu mới'); }} className="w-full py-3.5 rounded-2xl bg-[#243C8F] text-white font-bold text-sm mt-2 shadow-md">Lưu mục tiêu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
