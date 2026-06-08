import React, { useState, useEffect } from 'react';
import { Plus, Clock, Users, X, MessageSquare, ExternalLink, Trash2, Bell, ChevronRight, AlertCircle, Beer, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabase.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState('');
  const [currentHandicap, setCurrentHandicap] = useState('');
  const [showNameModal, setShowNameModal] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [rounds, setRounds] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState(null);
  const [commentInput, setCommentInput] = useState({});
  const [postType, setPostType] = useState('feeler');

  const [activity, setActivity] = useState('Golf');
  const [course, setCourse] = useState('');
  const [date, setDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [rate, setRate] = useState('');
  const [bookingLink, setBookingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [hasSocial, setHasSocial] = useState(false);
  const [socialLocation, setSocialLocation] = useState('');
  const [socialNotes, setSocialNotes] = useState('');

  useEffect(() => {
    const savedName = localStorage.getItem('dingg_name');
    const savedHcp = localStorage.getItem('dingg_hcp');
    if (savedName) {
      setCurrentUser(savedName);
      setCurrentHandicap(savedHcp || '');
      setShowNameModal(false);
    }
    loadRounds();

    const channel = supabase
      .channel('dinggs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dinggs' }, () => {
        loadRounds();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadRounds() {
    const { data, error } = await supabase
      .from('dinggs')
      .select('*')
      .order('date', { ascending: true })
      .order('time_start', { ascending: true });
    if (error) {
      console.error('Load error', error);
      setLoading(false);
      return;
    }
    const normalized = (data || []).map(r => ({
      id: r.id,
      activity: r.activity,
      type: r.type,
      course: r.course,
      date: r.date,
      timeStart: r.time_start,
      timeEnd: r.time_end || r.time_start,
      rate: r.rate || '',
      bookingLink: r.booking_link || '',
      notes: r.notes || '',
      maxPlayers: r.max_players,
      organizer: r.organizer,
      joined: r.joined || [],
      maybe: r.maybe || [],
      declined: r.declined || [],
      handicaps: r.handicaps || {},
      comments: r.comments || [],
      hasSocial: r.has_social,
      socialLocation: r.social_location || '',
      socialNotes: r.social_notes || '',
      socialJoined: r.social_joined || [],
    }));
    setRounds(normalized);
    setLoading(false);
  }

  function saveName() {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    const hcp = handicapInput.trim();
    setCurrentUser(name);
    setCurrentHandicap(hcp);
    localStorage.setItem('dingg_name', name);
    if (hcp) localStorage.setItem('dingg_hcp', hcp);
    setShowNameModal(false);
  }

  function userWithHcp(name, hcp) {
    return hcp ? `${name} · ${hcp}` : name;
  }

  function getPlayerHcp(round, name) {
    if (round.handicaps && round.handicaps[name]) return round.handicaps[name];
    return null;
  }

  async function createRound() {
    if (!course.trim() || !date || !timeStart) return;
    if (postType === 'feeler' && !timeEnd) return;
    const newRow = {
      activity,
      type: postType,
      course: course.trim(),
      date,
      time_start: timeStart,
      time_end: postType === 'feeler' ? timeEnd : timeStart,
      rate: rate.trim(),
      booking_link: bookingLink.trim(),
      notes: notes.trim(),
      max_players: parseInt(maxPlayers) || 4,
      organizer: currentUser,
      joined: [currentUser],
      maybe: [],
      declined: [],
      handicaps: currentHandicap ? { [currentUser]: currentHandicap } : {},
      comments: [],
      has_social: hasSocial,
      social_location: hasSocial ? socialLocation.trim() : null,
      social_notes: hasSocial ? socialNotes.trim() : null,
      social_joined: hasSocial ? [currentUser] : [],
    };
    const { error } = await supabase.from('dinggs').insert(newRow);
    if (error) {
      alert('Failed to save: ' + error.message);
      return;
    }
    resetForm();
    setShowCreate(false);
    loadRounds();
  }

  function resetForm() {
    setActivity('Golf');
    setCourse(''); setDate(''); setTimeStart(''); setTimeEnd('');
    setRate(''); setBookingLink(''); setNotes(''); setMaxPlayers(4);
    setHasSocial(false); setSocialLocation(''); setSocialNotes('');
    setPostType('feeler');
  }

  async function updateRound(round, dbUpdates) {
    const { error } = await supabase.from('dinggs').update(dbUpdates).eq('id', round.id);
    if (error) console.error('Update error', error);
    loadRounds();
  }

  async function rsvp(round, status) {
    const joined = round.joined.filter(n => n !== currentUser);
    const maybe = (round.maybe || []).filter(n => n !== currentUser);
    const declined = (round.declined || []).filter(n => n !== currentUser);
    if (status === 'joined') joined.push(currentUser);
    if (status === 'maybe') maybe.push(currentUser);
    if (status === 'declined') declined.push(currentUser);

    const handicaps = { ...(round.handicaps || {}) };
    if (status === 'joined' && currentHandicap) handicaps[currentUser] = currentHandicap;

    updateRound(round, { joined, maybe, declined, handicaps });
  }

  async function toggleSocial(round) {
    const socialJoined = round.socialJoined || [];
    const isIn = socialJoined.includes(currentUser);
    const updated = isIn
      ? socialJoined.filter(n => n !== currentUser)
      : [...socialJoined, currentUser];
    updateRound(round, { social_joined: updated });
  }

  async function convertToConfirmed(round) {
    const finalTime = prompt('Lock in the start time (24-hour format, e.g., 08:42):', round.timeStart);
    if (!finalTime) return;
    updateRound(round, { type: 'confirmed', time_start: finalTime, time_end: finalTime });
  }

  async function addComment(round) {
    const text = (commentInput[round.id] || '').trim();
    if (!text) return;
    const comment = {
      id: 'c_' + Date.now(),
      author: currentUser,
      text,
      timestamp: Date.now(),
    };
    const newComments = [...(round.comments || []), comment];
    updateRound(round, { comments: newComments });
    setCommentInput({ ...commentInput, [round.id]: '' });
  }

  async function deleteRound(round) {
    if (round.organizer !== currentUser) return;
    if (!confirm('Delete this dingg?')) return;
    const { error } = await supabase.from('dinggs').delete().eq('id', round.id);
    if (error) console.error(error);
    loadRounds();
  }

  function formatDate(d) {
    try {
      const dt = new Date(d + 'T12:00');
      return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } catch { return d; }
  }

  function formatTime(t) {
    try {
      const [h, m] = t.split(':');
      const hr = parseInt(h);
      const ampm = hr >= 12 ? 'PM' : 'AM';
      const dh = hr % 12 || 12;
      return `${dh}:${m} ${ampm}`;
    } catch { return t; }
  }

  function formatTimeDisplay(round) {
    if (round.type === 'feeler' && round.timeEnd && round.timeEnd !== round.timeStart) {
      return `${formatTime(round.timeStart)} – ${formatTime(round.timeEnd)}`;
    }
    return formatTime(round.timeStart);
  }

  function getMyStatus(round) {
    if (round.joined?.includes(currentUser)) return 'joined';
    if (round.maybe?.includes(currentUser)) return 'maybe';
    if (round.declined?.includes(currentUser)) return 'declined';
    return null;
  }

  const ACTIVITIES = ['Golf', 'Hike', 'Workout', 'Walk', 'Pickleball', 'Tennis', 'Bike', 'Run', 'Dog walk', 'Dinner', 'Drinks', 'Other'];

  function venueLabel() {
    if (activity === 'Golf') return 'Course';
    if (activity === 'Hike') return 'Trail';
    if (activity === 'Workout') return 'Gym / location';
    if (['Dinner', 'Drinks'].includes(activity)) return 'Place';
    return 'Where';
  }

  if (showNameModal) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-6">
              <Bell className="w-8 h-8 text-amber-400" strokeWidth={2.5} fill="currentColor" />
              <h1 className="text-5xl tracking-tight text-white lowercase" style={{ fontWeight: 800, letterSpacing: '-0.04em' }}>dingg</h1>
            </div>
            <p className="text-zinc-400 text-sm">Drop a plan. See who's in.</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2 font-medium">Your name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Will"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition mb-4"
              autoFocus
            />
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2 font-medium">Golf handicap <span className="normal-case tracking-normal text-zinc-600">(optional)</span></label>
            <input
              type="text"
              inputMode="decimal"
              value={handicapInput}
              onChange={(e) => setHandicapInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              placeholder="12.4"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition"
            />
            <button
              onClick={saveName}
              className="w-full mt-5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-3 rounded-lg transition"
            >
              Continue
            </button>
            <p className="text-xs text-zinc-500 mt-4 text-center">Everyone in the app sees the same dinggs.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-950/90 backdrop-blur border-b border-zinc-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" strokeWidth={2.5} fill="currentColor" />
            <h1 className="text-2xl tracking-tight text-white lowercase" style={{ fontWeight: 800, letterSpacing: '-0.04em' }}>dingg</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">{userWithHcp(currentUser, currentHandicap)}</span>
            <button
              onClick={() => {
                localStorage.removeItem('dingg_name');
                localStorage.removeItem('dingg_hcp');
                setShowNameModal(true);
                setCurrentUser('');
                setCurrentHandicap('');
              }}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              switch
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-4 rounded-xl mb-6 flex items-center justify-center gap-2 shadow-lg transition"
          >
            <Plus className="w-5 h-5" />
            Drop a dingg
          </button>
        )}

        {showCreate && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">New dingg</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2 font-medium">Activity</label>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITIES.map(a => (
                  <button
                    key={a}
                    onClick={() => setActivity(a)}
                    className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition ${
                      activity === a ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-zinc-800 rounded-lg">
              <button
                onClick={() => setPostType('feeler')}
                className={`py-2.5 px-3 rounded-md text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                  postType === 'feeler' ? 'bg-zinc-700 text-amber-400 shadow-sm' : 'text-zinc-500'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Feeler
              </button>
              <button
                onClick={() => setPostType('confirmed')}
                className={`py-2.5 px-3 rounded-md text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                  postType === 'confirmed' ? 'bg-zinc-700 text-emerald-400 shadow-sm' : 'text-zinc-500'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmed
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-4 px-1">
              {postType === 'feeler' ? 'Testing interest. Time window, not locked in yet.' : "It's booked. Specific time, fixed spots."}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">{venueLabel()}</label>
                <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} placeholder={activity === 'Golf' ? 'Whirlwind Cattail' : 'Where are we going'}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-400" style={{ colorScheme: 'dark' }} />
              </div>

              {postType === 'feeler' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Earliest</label>
                    <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)}
                      className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-400" style={{ colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Latest</label>
                    <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)}
                      className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-400" style={{ colorScheme: 'dark' }} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Start time</label>
                  <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-400" style={{ colorScheme: 'dark' }} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Cost <span className="text-zinc-600 normal-case tracking-normal">(optional)</span></label>
                  <input type="text" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$65"
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Spots</label>
                  <select value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-400">
                    {[2,3,4,5,6,7,8,12,16,20].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {postType === 'confirmed' && (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Booking link <span className="text-zinc-600 normal-case tracking-normal">(optional)</span></label>
                  <input type="url" value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} placeholder="https://golfnow.com/..."
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
                </div>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Notes <span className="text-zinc-600 normal-case tracking-normal">(optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Flexible on course too, lmk preferences" rows={2}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 resize-none" />
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={hasSocial} onChange={(e) => setHasSocial(e.target.checked)} className="w-4 h-4 accent-amber-400" />
                  <span className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                    <Beer className="w-4 h-4 text-amber-400" />Add social after
                  </span>
                </label>

                {hasSocial && (
                  <div className="mt-3 space-y-3 pl-7">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Where</label>
                      <input type="text" value={socialLocation} onChange={(e) => setSocialLocation(e.target.value)} placeholder="The Hangar, clubhouse, etc."
                        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5 font-medium">Notes</label>
                      <input type="text" value={socialNotes} onChange={(e) => setSocialNotes(e.target.value)} placeholder="Beers + apps, spouses welcome"
                        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
                    </div>
                    <p className="text-xs text-zinc-500">Spouses and non-players can join the social separately.</p>
                  </div>
                )}
              </div>

              <button onClick={createRound} disabled={!course.trim() || !date || !timeStart || (postType === 'feeler' && !timeEnd)}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-lg transition mt-2">
                Drop it
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-zinc-600 py-12 text-sm">Loading...</div>
        ) : rounds.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-zinc-800 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-zinc-500 text-sm">No dinggs yet</p>
            <p className="text-zinc-600 text-xs mt-1">Be the first to drop something</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rounds.map(round => {
              const myStatus = getMyStatus(round);
              const isExpanded = expandedRound === round.id;
              const spotsLeft = round.maxPlayers - round.joined.length;
              const startDt = round.date + 'T' + (round.timeEnd || round.timeStart || '23:59');
              const isPast = new Date(startDt) < new Date();
              const isFeeler = round.type === 'feeler';
              const isMine = round.organizer === currentUser;
              const socialJoined = round.socialJoined || [];
              const inSocial = socialJoined.includes(currentUser);

              return (
                <div key={round.id} className={`bg-zinc-900 border-2 rounded-2xl shadow-xl transition ${
                  isPast ? 'opacity-50 border-zinc-800' : isFeeler ? 'border-amber-400/50 border-dashed' : 'border-emerald-500/60'
                }`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {round.activity && (
                            <span className="text-xs font-medium text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full">{round.activity}</span>
                          )}
                          {isFeeler ? (
                            <span className="text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Feeler
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Booked
                            </span>
                          )}
                          {isPast && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">past</span>}
                        </div>
                        <h3 className="text-lg font-semibold text-white truncate">{round.course}</h3>
                        <div className="flex items-center gap-3 text-sm text-zinc-400 mt-1">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDate(round.date)} · {formatTimeDisplay(round)}</span>
                        </div>
                        {round.rate && <div className="text-sm text-amber-400 font-medium mt-1">{round.rate}</div>}
                      </div>
                      {isMine && (
                        <button onClick={() => deleteRound(round)} className="text-zinc-600 hover:text-red-400 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {round.notes && <p className="text-sm text-zinc-400 italic mb-3 pl-3 border-l-2 border-zinc-700">{round.notes}</p>}

                    {isFeeler && isMine && !isPast && (
                      <button onClick={() => convertToConfirmed(round)} className="w-full mb-3 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-lg border border-emerald-500/30 transition flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />Lock it in
                      </button>
                    )}

                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="w-4 h-4 text-zinc-500" />
                        <span className="text-zinc-200 font-medium">{round.joined.length}/{round.maxPlayers}</span>
                        <span className="text-zinc-500">{isFeeler ? 'interested' : 'in'}</span>
                        {round.maybe?.length > 0 && <span className="text-zinc-500 ml-1">· {round.maybe.length} maybe</span>}
                      </div>
                      {round.bookingLink && (
                        <a href={round.bookingLink} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium">
                          Book <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {(round.joined.length > 0 || (round.maybe?.length || 0) > 0) && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {round.joined.map(name => {
                          const hcp = getPlayerHcp(round, name);
                          return (
                            <span key={'j'+name} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-medium">
                              ✓ {name}{hcp ? ` · ${hcp}` : ''}{name === round.organizer && ' ★'}
                            </span>
                          );
                        })}
                        {round.maybe?.map(name => {
                          const hcp = getPlayerHcp(round, name);
                          return (
                            <span key={'m'+name} className="text-xs bg-amber-400/10 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-full">
                              ? {name}{hcp ? ` · ${hcp}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {!isPast && (
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => rsvp(round, 'joined')} disabled={spotsLeft <= 0 && myStatus !== 'joined'}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                            myStatus === 'joined' ? 'bg-emerald-500 text-zinc-950' :
                            spotsLeft <= 0 ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' :
                            'bg-zinc-800 text-zinc-200 hover:bg-emerald-500/20 hover:text-emerald-300 border border-zinc-700'
                          }`}>
                          {spotsLeft <= 0 && myStatus !== 'joined' ? 'Full' : isFeeler ? 'Interested' : "I'm in"}
                        </button>
                        <button onClick={() => rsvp(round, 'maybe')}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                            myStatus === 'maybe' ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-200 hover:bg-amber-400/20 hover:text-amber-300 border border-zinc-700'
                          }`}>
                          Maybe
                        </button>
                        <button onClick={() => rsvp(round, 'declined')}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                            myStatus === 'declined' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700'
                          }`}>
                          Can't
                        </button>
                      </div>
                    )}

                    {round.hasSocial && (
                      <div className="mt-4 p-3 bg-amber-400/5 border border-amber-400/30 rounded-xl">
                        <div className="flex items-start gap-2 mb-2">
                          <Beer className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-amber-200">Social after</div>
                            {round.socialLocation && <div className="text-sm text-amber-100/80">{round.socialLocation}</div>}
                            {round.socialNotes && <div className="text-xs text-amber-100/60 mt-0.5">{round.socialNotes}</div>}
                          </div>
                        </div>

                        {socialJoined.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {socialJoined.map(name => (
                              <span key={'s'+name} className="text-xs bg-zinc-900 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full font-medium">{name}</span>
                            ))}
                          </div>
                        )}

                        {!isPast && (
                          <button onClick={() => toggleSocial(round)}
                            className={`w-full py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                              inSocial ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-900 text-amber-300 hover:bg-zinc-800 border border-amber-400/30'
                            }`}>
                            {inSocial ? "✓ I'm in for after" : "Join the social"}
                          </button>
                        )}
                      </div>
                    )}

                    <button onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                      className="w-full mt-3 flex items-center justify-between text-sm text-zinc-500 hover:text-zinc-300 py-2">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {round.comments?.length || 0} {round.comments?.length === 1 ? 'comment' : 'comments'}
                      </span>
                      <ChevronRight className={`w-4 h-4 transition ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>

                    {isExpanded && (
                      <div className="mt-2 pt-3 border-t border-zinc-800">
                        {round.comments?.length > 0 && (
                          <div className="space-y-2.5 mb-3">
                            {round.comments.map(c => (
                              <div key={c.id} className="text-sm">
                                <span className="font-medium text-zinc-200">{c.author}</span>
                                <span className="text-zinc-400"> {c.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input type="text" value={commentInput[round.id] || ''}
                            onChange={(e) => setCommentInput({ ...commentInput, [round.id]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && addComment(round)}
                            placeholder="Suggest something, ask a question..."
                            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
                          <button onClick={() => addComment(round)} disabled={!(commentInput[round.id] || '').trim()}
                            className="bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 px-4 py-2 rounded-lg text-sm font-medium transition">
                            Post
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex gap-3">
          <AlertCircle className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400 leading-relaxed">
            <strong className="text-zinc-200">v0.1 · friends-only beta.</strong> Real database, real-time updates. No accounts yet — just type your name.
          </p>
        </div>
      </main>
    </div>
  );
}
