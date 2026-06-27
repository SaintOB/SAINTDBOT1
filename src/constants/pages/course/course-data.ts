export interface Lesson {
    id: string;
    title: string;
    duration: string;
    description: string;
    videoUrl: string;
    free?: boolean;
}

export interface Module {
    id: string;
    title: string;
    description: string;
    lessons: Lesson[];
}

export const COURSE_INFO = {
    title: 'Team.Saintfx Course 2.0',
    subtitle: 'Master Forex, Cryptos & VIX — from strategy fundamentals to running live trades profitably.',
    instructor: 'Saint',
    totalLessons: 0,
    level: 'Beginner to Intermediate',
};

export const MODULES: Module[] = [
    {
        id: 'module-1',
        title: 'Module 1 — Getting Started',
        description: 'Set up your Deriv account, understand the platform, and prepare to trade.',
        lessons: [
            {
                id: 'l1-1',
                title: 'Welcome & Course Overview',
                duration: '5:00',
                description: 'What you will learn and how to get the most from this course.',
                videoUrl: '',
                free: true,
            },
            {
                id: 'l1-2',
                title: 'Setting Up Your Deriv Account',
                duration: '8:00',
                description: 'Create and verify your Deriv account step by step.',
                videoUrl: '',
            },
            {
                id: 'l1-3',
                title: 'Navigating SaintDBot',
                duration: '10:00',
                description: 'Tour of the platform — bots, analysis tool, and key features.',
                videoUrl: '',
            },
        ],
    },
    {
        id: 'module-2',
        title: 'Module 2 — Understanding the Markets',
        description: 'Learn how synthetic indices work and which conditions favour each bot strategy.',
        lessons: [
            {
                id: 'l2-1',
                title: 'What Are Synthetic Indices?',
                duration: '12:00',
                description: 'How volatility indices are generated and why they are unique.',
                videoUrl: '',
            },
            {
                id: 'l2-2',
                title: 'Digit Trading Explained',
                duration: '15:00',
                description: 'Differs, Matches, Even/Odd — how each contract type works.',
                videoUrl: '',
            },
            {
                id: 'l2-3',
                title: 'Reading the Analysis Tool',
                duration: '18:00',
                description: 'Using the digit frequency chart to spot trading edges.',
                videoUrl: '',
            },
        ],
    },
    {
        id: 'module-3',
        title: 'Module 3 — Running the Bots',
        description: 'Load, configure, and run the SaintDBot strategies safely.',
        lessons: [
            {
                id: 'l3-1',
                title: 'Loading a Bot',
                duration: '10:00',
                description: 'How to load a bot XML file and what each setting means.',
                videoUrl: '',
            },
            {
                id: 'l3-2',
                title: 'Conservative vs Balanced Strategies',
                duration: '14:00',
                description: 'When to use each tier and how risk management is built in.',
                videoUrl: '',
            },
            {
                id: 'l3-3',
                title: 'Martingale — Pros, Cons & Limits',
                duration: '16:00',
                description: 'How the recovery system works and why hard stops matter.',
                videoUrl: '',
            },
            {
                id: 'l3-4',
                title: 'Setting Take Profit & Stop Loss',
                duration: '12:00',
                description: 'Best practices for daily TP/SL to protect your balance.',
                videoUrl: '',
            },
        ],
    },
    {
        id: 'module-4',
        title: 'Module 4 — Risk Management & Mindset',
        description: 'The discipline and habits that separate profitable traders from the rest.',
        lessons: [
            {
                id: 'l4-1',
                title: 'Bankroll Management Rules',
                duration: '20:00',
                description: 'How much to risk per session and how to grow a small account.',
                videoUrl: '',
            },
            {
                id: 'l4-2',
                title: 'When NOT to Trade',
                duration: '10:00',
                description: 'Recognising bad conditions and knowing when to sit out.',
                videoUrl: '',
            },
            {
                id: 'l4-3',
                title: 'Tracking Your Results',
                duration: '8:00',
                description: 'Simple journaling to spot patterns and improve over time.',
                videoUrl: '',
            },
        ],
    },
];

COURSE_INFO.totalLessons = MODULES.reduce((sum, m) => sum + m.lessons.length, 0);
