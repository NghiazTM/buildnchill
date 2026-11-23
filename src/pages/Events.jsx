import { useEffect, useState } from 'react';
import { BiBell, BiBellOff, BiCalendarPlus, BiDownload, BiMap, BiTime } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { PageHero, Seo, Spinner, useToast } from '../components/ui';
import { Countdown, useNow, googleCalendarUrl, downloadIcs, pushSupported, currentPush, enablePush, disablePush } from '../lib/community';
import '../styles/pages.css';

const fmtDay = (d) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const NotifyCard = () => {
  const toast = useToast();
  const [state, setState] = useState('loading'); // loading | unsupported | off | on | busy
  useEffect(() => {
    if (!pushSupported()) { setState('unsupported'); return; }
    currentPush().then((s) => setState(s ? 'on' : 'off')).catch(() => setState('off'));
  }, []);
  const toggle = async () => {
    const was = state;
    setState('busy');
    try {
      if (was === 'on') { await disablePush(); setState('off'); toast('Đã tắt thông báo sự kiện', 'success'); }
      else { await enablePush(); setState('on'); toast('Đã bật! Bạn sẽ được nhắc trước khi sự kiện bắt đầu.', 'success'); }
    } catch (e) {
      setState(was);
      toast(e.message || 'Không bật được thông báo', 'error');
    }
  };
  return (
    <div className="bnc-card bnc-card-pad bnc-notify">
      <div className="ic">{state === 'on' ? <BiBell /> : <BiBellOff />}</div>
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold">Nhắc tôi khi sự kiện sắp bắt đầu</div>
        <div className="small text-soft">
          {state === 'unsupported'
            ? 'Trình duyệt này chưa hỗ trợ. Trên iPhone: bấm Chia sẻ → “Thêm vào MH chính” rồi mở web từ biểu tượng đó.'
            : 'Trình duyệt sẽ hiện thông báo khoảng 30 phút trước mỗi sự kiện, kể cả khi bạn không mở web.'}
        </div>
      </div>
      {state !== 'unsupported' && (
        <button type="button" className={`bnc-btn bnc-btn-sm ${state === 'on' ? 'bnc-btn-ghost' : ''}`} onClick={toggle} disabled={state === 'loading' || state === 'busy'} aria-pressed={state === 'on'}>
          {state === 'on' ? 'Tắt thông báo' : 'Bật thông báo'}
        </button>
      )}
    </div>
  );
};

const EventCard = ({ ev, now, past }) => {
  const start = new Date(ev.starts_at).getTime();
  const end = ev.ends_at ? new Date(ev.ends_at).getTime() : start + 3600000;
  const live = now >= start && now <= end;
  return (
    <article id={ev.id} className={`bnc-card bnc-event ${past ? 'past' : ''} ${live ? 'live' : ''}`}>
      {ev.image_url && <img className="cover" src={ev.image_url} alt="" loading="lazy" />}
      <div className="bnc-card-pad">
        <div className="when">
          <span className="date">{fmtDay(ev.starts_at)}</span>
          <span><BiTime /> {fmtTime(ev.starts_at)}{ev.ends_at ? ` – ${fmtTime(ev.ends_at)}` : ''}</span>
          {ev.location && <span><BiMap /> {ev.location}</span>}
          {live && <span className="bnc-live on">Đang diễn ra</span>}
        </div>
        <h3 className="h5 mt-2 mb-2">{ev.title}</h3>
        {ev.description && <p className="desc text-soft mb-0">{ev.description}</p>}
        {!past && (
          <div className="d-flex flex-wrap gap-2 mt-3">
            <a className="bnc-btn bnc-btn-sm bnc-btn-ghost" href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer"><BiCalendarPlus /> Google Calendar</a>
            <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => downloadIcs(ev)}><BiDownload /> Tải file lịch (.ics)</button>
          </div>
        )}
      </div>
    </article>
  );
};

const Events = () => {
  const now = useNow();
  const [events, setEvents] = useState(null);

  useEffect(() => {
    supabase.from('server_events').select('id,title,description,starts_at,ends_at,location,image_url')
      .gte('starts_at', new Date(Date.now() - 120 * 86400000).toISOString())
      .order('starts_at', { ascending: true }).limit(200)
      .then(({ data }) => setEvents(data || []));
  }, []);

  const endOf = (e) => (e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 3600000);
  const upcoming = (events || []).filter((e) => endOf(e) >= now);
  const past = (events || []).filter((e) => endOf(e) < now).reverse().slice(0, 12);
  const next = upcoming.find((e) => new Date(e.starts_at).getTime() > now);

  return (
    <>
      <Seo title="Lịch sự kiện" description="Lịch sự kiện máy chủ Minecraft BuildnChill: đếm ngược, thêm vào lịch điện thoại và bật thông báo để không bỏ lỡ." path="/events" />
      <PageHero pill="Cộng đồng" title="Lịch" highlight="sự kiện" subtitle="Đừng bỏ lỡ sự kiện nào — thêm vào lịch điện thoại hoặc bật thông báo để được nhắc trước giờ." crumbs={[{ label: 'Sự kiện' }]} />

      <section className="bnc-section pt-5">
        <div className="container" style={{ maxWidth: 960 }}>
          {events === null ? <Spinner /> : (
            <>
              {next && (
                <div className="bnc-card bnc-card-pad bnc-next-event mb-4">
                  <div className="small text-dim text-uppercase fw-semibold mb-1">Sự kiện tiếp theo</div>
                  <a href={`#${next.id}`} className="h4 d-block mb-3 text-white">{next.title}</a>
                  <Countdown to={next.starts_at} now={now} />
                </div>
              )}
              <NotifyCard />

              <h2 className="h5 mt-5 mb-3">Sắp diễn ra</h2>
              {upcoming.length === 0 ? (
                <div className="bnc-card bnc-empty">Chưa có sự kiện nào sắp tới. Theo dõi Discord để cập nhật sớm nhất!</div>
              ) : (
                <div className="bnc-events">{upcoming.map((e) => <EventCard key={e.id} ev={e} now={now} />)}</div>
              )}

              {past.length > 0 && (
                <>
                  <h2 className="h5 mt-5 mb-3">Đã diễn ra</h2>
                  <div className="bnc-events">{past.map((e) => <EventCard key={e.id} ev={e} now={now} past />)}</div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default Events;
