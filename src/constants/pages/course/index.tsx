import React, { useState } from 'react';
import { MODULES, COURSE_INFO, Module, Lesson } from './course-data';
import './course.scss';

const COURSE_PASSWORD = 'saintfx2025';
const STORAGE_KEY = 'saint_course_auth';

const PlayIcon = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='currentColor'>
        <path d='M8 5v14l11-7z' />
    </svg>
);

const CheckIcon = () => (
    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5'>
        <polyline points='20 6 9 17 4 12' />
    </svg>
);

const ClockIcon = () => (
    <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <circle cx='12' cy='12' r='10' />
        <polyline points='12 6 12 12 16 14' />
    </svg>
);

const CourseHeader = ({ onLogout }: { onLogout?: () => void }) => (
    <header className='course-standalone-header'>
        <div className='course-standalone-header__inner'>
            <div className='course-standalone-header__brand'>
                <span className='course-standalone-header__team'>Team.</span>
                <span className='course-standalone-header__saint'>Saint</span>
                <span className='course-standalone-header__fx'>FX</span>
            </div>
            <div className='course-standalone-header__right'>
                <span className='course-standalone-header__label'>Course 2.0</span>
                {onLogout && (
                    <button className='course-standalone-header__logout' onClick={onLogout}>
                        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
                            <polyline points='16 17 21 12 16 7' />
                            <line x1='21' y1='12' x2='9' y2='12' />
                        </svg>
                        Sign Out
                    </button>
                )}
            </div>
        </div>
    </header>
);

const PasswordGate = ({ onUnlock }: { onUnlock: () => void }) => {
    const [value, setValue] = useState('');
    const [error, setError] = useState(false);
    const [shaking, setShaking] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (value.trim() === COURSE_PASSWORD) {
            sessionStorage.setItem(STORAGE_KEY, '1');
            onUnlock();
        } else {
            setError(true);
            setShaking(true);
            setValue('');
            setTimeout(() => setShaking(false), 600);
        }
    };

    return (
        <div className='course-gate'>
            <CourseHeader />
            <div className='course-gate__body'>
                <div className={`course-gate__card${shaking ? ' course-gate__card--shake' : ''}`}>
                    <img src='/course-hero.png' alt='Team.SaintFX Course 2.0' className='course-gate__image' />
                    <div className='course-gate__content'>
                        <div className='course-gate__lock-icon'>
                            <svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#e53535' strokeWidth='1.5'>
                                <rect x='3' y='11' width='18' height='11' rx='2' fill='rgba(229,53,53,0.08)' />
                                <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                                <circle cx='12' cy='16' r='1.5' fill='#e53535' stroke='none' />
                            </svg>
                        </div>
                        <h2 className='course-gate__title'>Member Access</h2>
                        <p className='course-gate__subtitle'>Enter your course password to continue</p>
                        <form onSubmit={submit} className='course-gate__form'>
                            <input
                                type='password'
                                className={`course-gate__input${error ? ' course-gate__input--error' : ''}`}
                                placeholder='Course password'
                                value={value}
                                onChange={e => { setValue(e.target.value); setError(false); }}
                                autoFocus
                            />
                            {error && <p className='course-gate__error'>Incorrect password. Try again.</p>}
                            <button type='submit' className='course-gate__btn'>
                                <PlayIcon /> Access Course
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

const getEmbedUrl = (videoUrl: string): string | null => {
    if (!videoUrl) return null;
    if (videoUrl.includes('drive.google.com')) {
        const match = videoUrl.match(/\/d\/([^/?]+)/);
        if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
        return null;
    }
    return `https://www.youtube.com/embed/${videoUrl}?autoplay=1&rel=0`;
};

const CoursePlayer = ({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) => {
    const embedUrl = getEmbedUrl(lesson.videoUrl);
    return (
        <div className='course-player'>
            <div className='course-player__backdrop' onClick={onClose} />
            <div className='course-player__modal'>
                <div className='course-player__header'>
                    <h3 className='course-player__title'>{lesson.title}</h3>
                    <button className='course-player__close' onClick={onClose}>
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <line x1='18' y1='6' x2='6' y2='18' />
                            <line x1='6' y1='6' x2='18' y2='18' />
                        </svg>
                    </button>
                </div>
                <div className='course-player__video-wrap'>
                    {!embedUrl ? (
                        <div className='course-player__placeholder'>
                            <svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='#e53535' strokeWidth='1.5'>
                                <circle cx='12' cy='12' r='10' />
                                <polygon points='10 8 16 12 10 16 10 8' fill='#e53535' stroke='none' />
                            </svg>
                            <p>Video coming soon</p>
                            <span>Add the video link to course-data.ts to activate this lesson.</span>
                        </div>
                    ) : (
                        <iframe
                            src={embedUrl}
                            title={lesson.title}
                            frameBorder='0'
                            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                            allowFullScreen
                        />
                    )}
                </div>
                <p className='course-player__desc'>{lesson.description}</p>
            </div>
        </div>
    );
};

const LessonRow = ({
    lesson,
    index,
    isWatched,
    onPlay,
    onToggleWatched,
}: {
    lesson: Lesson;
    index: number;
    isWatched: boolean;
    onPlay: (lesson: Lesson) => void;
    onToggleWatched: (id: string) => void;
}) => (
    <div className={`course-lesson${isWatched ? ' course-lesson--watched' : ''}`}>
        <div className='course-lesson__num'>{index + 1}</div>
        <div className='course-lesson__info'>
            <span className='course-lesson__title'>{lesson.title}</span>
            <span className='course-lesson__meta'>
                <ClockIcon /> {lesson.duration}
            </span>
        </div>
        <div className='course-lesson__actions'>
            {lesson.free && <span className='course-lesson__free-badge'>FREE</span>}
            <button
                className='course-lesson__watched-btn'
                onClick={() => onToggleWatched(lesson.id)}
                title={isWatched ? 'Mark unwatched' : 'Mark watched'}
            >
                <CheckIcon />
            </button>
            <button className='course-lesson__play-btn' onClick={() => onPlay(lesson)}>
                <PlayIcon /> Watch
            </button>
        </div>
    </div>
);

const ModuleCard = ({
    module,
    watched,
    onPlay,
    onToggleWatched,
}: {
    module: Module;
    watched: Set<string>;
    onPlay: (lesson: Lesson) => void;
    onToggleWatched: (id: string) => void;
}) => {
    const [expanded, setExpanded] = useState(true);
    const doneCount = module.lessons.filter(l => watched.has(l.id)).length;
    const progress = Math.round((doneCount / module.lessons.length) * 100);

    return (
        <div className='course-module'>
            <button className='course-module__header' onClick={() => setExpanded(e => !e)}>
                <div className='course-module__header-left'>
                    <span className='course-module__title'>{module.title}</span>
                    <span className='course-module__meta'>
                        {module.lessons.length} lessons · {doneCount}/{module.lessons.length} done
                    </span>
                </div>
                <div className='course-module__header-right'>
                    <div className='course-module__progress-ring'>
                        <svg width='36' height='36' viewBox='0 0 36 36'>
                            <circle cx='18' cy='18' r='15' fill='none' stroke='rgba(255,255,255,0.08)' strokeWidth='3' />
                            <circle
                                cx='18'
                                cy='18'
                                r='15'
                                fill='none'
                                stroke='#22c55e'
                                strokeWidth='3'
                                strokeDasharray={`${(progress / 100) * 94.2} 94.2`}
                                strokeLinecap='round'
                                transform='rotate(-90 18 18)'
                            />
                        </svg>
                        <span className='course-module__progress-pct'>{progress}%</span>
                    </div>
                    <svg
                        width='16'
                        height='16'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    >
                        <polyline points='6 9 12 15 18 9' />
                    </svg>
                </div>
            </button>

            {expanded && (
                <div className='course-module__lessons'>
                    <p className='course-module__desc'>{module.description}</p>
                    {module.lessons.map((lesson, i) => (
                        <LessonRow
                            key={lesson.id}
                            lesson={lesson}
                            index={i}
                            isWatched={watched.has(lesson.id)}
                            onPlay={onPlay}
                            onToggleWatched={onToggleWatched}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const CourseContent = ({ onLogout }: { onLogout?: () => void }) => {
    const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
    const [watched, setWatched] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('saint_course_watched');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch {
            return new Set();
        }
    });

    const toggleWatched = (id: string) => {
        setWatched(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            localStorage.setItem('saint_course_watched', JSON.stringify([...next]));
            return next;
        });
    };

    const allLessons = MODULES.flatMap(m => m.lessons);
    const totalWatched = allLessons.filter(l => watched.has(l.id)).length;
    const overallProgress = Math.round((totalWatched / COURSE_INFO.totalLessons) * 100);

    return (
        <div className='course-standalone'>
            <CourseHeader onLogout={onLogout} />

            {activeLesson && (
                <CoursePlayer lesson={activeLesson} onClose={() => setActiveLesson(null)} />
            )}

            <div className='course-page'>
                <div className='course-page__hero'>
                    <div className='course-page__hero-image-wrap'>
                        <img
                            src='/course-hero.png'
                            alt='Team.SaintFX Course 2.0'
                            className='course-page__hero-image'
                        />
                        <div className='course-page__hero-image-overlay' />
                    </div>

                    <div className='course-page__hero-body'>
                        <div className='course-page__hero-content'>
                            <div className='course-page__badge'>TRADING COURSE</div>
                            <h1 className='course-page__hero-title'>{COURSE_INFO.title}</h1>
                            <p className='course-page__hero-subtitle'>{COURSE_INFO.subtitle}</p>
                            <div className='course-page__stats'>
                                <div className='course-page__stat'>
                                    <span className='course-page__stat-value'>{COURSE_INFO.totalLessons}</span>
                                    <span className='course-page__stat-label'>Lessons</span>
                                </div>
                                <div className='course-page__stat'>
                                    <span className='course-page__stat-value'>{MODULES.length}</span>
                                    <span className='course-page__stat-label'>Modules</span>
                                </div>
                                <div className='course-page__stat'>
                                    <span className='course-page__stat-value'>{COURSE_INFO.level}</span>
                                    <span className='course-page__stat-label'>Level</span>
                                </div>
                            </div>
                        </div>

                        <div className='course-page__progress-card'>
                            <div className='course-page__progress-header'>
                                <span>Your Progress</span>
                                <span className='course-page__progress-pct'>{overallProgress}%</span>
                            </div>
                            <div className='course-page__progress-bar'>
                                <div className='course-page__progress-fill' style={{ width: `${overallProgress}%` }} />
                            </div>
                            <p className='course-page__progress-note'>
                                {totalWatched} of {COURSE_INFO.totalLessons} lessons watched
                            </p>
                            {totalWatched === 0 && (
                                <button
                                    className='course-page__start-btn'
                                    onClick={() => setActiveLesson(allLessons[0])}
                                >
                                    <PlayIcon /> Start Course
                                </button>
                            )}
                            {totalWatched > 0 && totalWatched < COURSE_INFO.totalLessons && (
                                <button
                                    className='course-page__start-btn'
                                    onClick={() => {
                                        const next = allLessons.find(l => !watched.has(l.id));
                                        if (next) setActiveLesson(next);
                                    }}
                                >
                                    <PlayIcon /> Continue
                                </button>
                            )}
                            {totalWatched === COURSE_INFO.totalLessons && (
                                <div className='course-page__complete-badge'>
                                    <CheckIcon /> Course Complete!
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className='course-page__modules'>
                    {MODULES.map(module => (
                        <ModuleCard
                            key={module.id}
                            module={module}
                            watched={watched}
                            onPlay={setActiveLesson}
                            onToggleWatched={toggleWatched}
                        />
                    ))}
                </div>

                <footer className='course-standalone-footer'>
                    <span>© 2025 Team.SaintFX · All rights reserved</span>
                </footer>
            </div>
        </div>
    );
};

const CoursePage = ({ standalone }: { standalone?: boolean }) => {
    const [unlocked, setUnlocked] = useState(() => {
        if (!standalone) return true;
        return sessionStorage.getItem(STORAGE_KEY) === '1';
    });

    const handleLogout = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setUnlocked(false);
    };

    if (standalone && !unlocked) {
        return <PasswordGate onUnlock={() => setUnlocked(true)} />;
    }

    return <CourseContent onLogout={standalone ? handleLogout : undefined} />;
};

export default CoursePage;
