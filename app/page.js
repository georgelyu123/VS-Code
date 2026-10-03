'use client';

import { useEffect, useState } from 'react';

const adventures = [
  'Read one chapter somewhere comfy, preferably with a warm drink nearby.',
  'Explore a new game area without checking a guide first.',
  'Put on a favourite soundtrack and listen for one detail you had missed.',
  'Try a short flute phrase slowly, then play it once just for fun.',
  'Write down a story idea from a game world or a book you love.',
];

export default function Home() {
  const [theme, setTheme] = useState('day');
  const [adventure, setAdventure] = useState('Choose an idea for the next cosy break.');
  const [previousAdventure, setPreviousAdventure] = useState(-1);
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [today, setToday] = useState('October 2026');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('george-theme');
    if (savedTheme === 'night' || savedTheme === 'day') setTheme(savedTheme);
    setToday(new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }));
  }, []);

  useEffect(() => {
    if (!isTimerRunning) return undefined;
    const timerId = window.setInterval(() => {
      setSecondsLeft((currentSeconds) => {
        if (currentSeconds <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return currentSeconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isTimerRunning]);

  const toggleTheme = () => {
    const nextTheme = theme === 'night' ? 'day' : 'night';
    window.localStorage.setItem('george-theme', nextTheme);
    setTheme(nextTheme);
  };

  const chooseAdventure = () => {
    let nextAdventure = Math.floor(Math.random() * adventures.length);
    while (adventures.length > 1 && nextAdventure === previousAdventure) {
      nextAdventure = Math.floor(Math.random() * adventures.length);
    }
    setPreviousAdventure(nextAdventure);
    setAdventure(adventures[nextAdventure]);
  };

  const toggleTimer = () => {
    if (secondsLeft === 0) setSecondsLeft(5 * 60);
    setIsTimerRunning((running) => !running);
  };

  const resetTimer = () => {
    setIsTimerRunning(false);
    setSecondsLeft(5 * 60);
  };

  const timerText = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const timerButtonText = isTimerRunning ? 'Pause' : secondsLeft === 0 ? 'Start again' : 'Start';

  return (
    <div className={theme === 'night' ? 'night-theme' : ''}>
      <a className="skip-link" href="#content">Skip to content</a>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="George Lyu home">
          <span className="wordmark-mark" aria-hidden="true">G</span>
          <span>
            <strong>George Lyu</strong>
            <small>my little corner of the web</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#about">About</a><a href="#interests">Interests</a><a href="#music">Music</a><a href="#toolkit">Toolkit</a>
          <button className="theme-toggle" type="button" aria-pressed={theme === 'night'} aria-label={`Switch to ${theme === 'night' ? 'day' : 'night'} theme`} onClick={toggleTheme}>
            <span aria-hidden="true">{theme === 'night' ? '☀' : '☾'}</span> Theme
          </button>
        </nav>
      </header>

      <main id="top">
        <aside className="contents" aria-label="Contents">
          <p className="contents-label">Contents</p>
          <ol><li><a href="#about">About George</a></li><li><a href="#interests">Interests</a></li><li><a href="#music">Music</a></li><li><a href="#toolkit">Toolkit</a></li><li><a href="#now">Now</a></li></ol>
          <p className="contents-footnote">Last revised<br /><span>{today}</span></p>
        </aside>

        <article id="content">
          <p className="eyebrow">Hey, I’m George! <span aria-hidden="true">✦</span></p>
          <h1>George Lyu</h1>
          <p className="lede">Gamer, reader, and someone who can’t help humming along to a good tune.</p>
          <div className="article-rule" />

          <section id="about" aria-labelledby="about-heading"><h2 id="about-heading">About George</h2><div className="intro-grid"><div><p>I’m George! I like getting lost in a good book, exploring game worlds, and learning music one phrase at a time.</p><p>This is my little corner of the internet for the things I enjoy.</p></div><aside className="fact-card" aria-label="Quick facts about George"><div className="fact-card-title">George Lyu</div><dl><div><dt>Interests</dt><dd>Gaming · Reading</dd></div><div><dt>Instrument</dt><dd>Flute</dd></div><div><dt>Experience</dt><dd>6 years</dd></div><div><dt>Qualification</dt><dd>ABRSM Grade 8</dd></div></dl></aside></div></section>
          <section id="interests" aria-labelledby="interests-heading"><h2 id="interests-heading">Interests</h2><div className="interest-grid"><article className="interest-item"><span className="interest-number" aria-hidden="true">01</span><div><h3>Gaming</h3><p>I like games for their challenges, their stories, and the joy of discovering a new place with friends or on my own.</p></div></article><article className="interest-item"><span className="interest-number" aria-hidden="true">02</span><div><h3>Reading</h3><p>A good book is one of my favourite ways to slow down, follow an idea, and see the world through someone else’s eyes.</p></div></article></div></section>
          <section id="music" aria-labelledby="music-heading"><h2 id="music-heading">Music</h2><div className="music-layout"><div className="music-note" aria-hidden="true"><span>♩</span><span>♫</span><span>♪</span></div><div><p>I played the flute for six years and have achieved <strong>ABRSM Grade 8</strong>. It taught me patience, careful listening, and how much can be said without a single word.</p><p className="pull-quote">“Every note has a place.”</p></div></div></section>
          <section id="toolkit" aria-labelledby="toolkit-heading"><h2 id="toolkit-heading">Little toolkit</h2><div className="toolkit-grid"><article className="tool-card now-picker"><div className="tool-card-heading"><span className="tool-icon" aria-hidden="true">✦</span><div><p className="tool-label">Currently enjoying</p><h3>Pick a tiny adventure</h3></div></div><p className="adventure-text" aria-live="polite">{adventure}</p><button className="button" type="button" onClick={chooseAdventure}>Give me an idea</button></article><article className="tool-card practice-timer"><div className="tool-card-heading"><span className="tool-icon" aria-hidden="true">♬</span><div><p className="tool-label">Flute corner</p><h3>Practice timer</h3></div></div><p className="timer-display" role="timer" aria-live="off">{timerText}</p><div className="timer-controls"><button className="button" type="button" onClick={toggleTimer}>{timerButtonText}</button><button className="button button-secondary" type="button" onClick={resetTimer}>Reset</button></div><p className="timer-hint">A gentle five-minute warm-up.</p></article></div></section>
          <section id="now" className="now-section" aria-labelledby="now-heading"><div><p className="eyebrow">Right now</p><h2 id="now-heading">What I’m up to</h2></div><p>Nothing big at the moment — just making room for the next good idea.</p></section>
        </article>
      </main>
      <footer><span>© {new Date().getFullYear()} George Lyu</span><span>Made with curiosity and good vibes.</span></footer>
    </div>
  );
}
