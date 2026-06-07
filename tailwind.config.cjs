/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: ['./docs/**/*.{md,vue,ts}'],
    safelist: [
        'my-8',
        'overflow-x-auto',
        'rounded-xl',
        'border',
        'border-white/10',
        'bg-slate-900/40',
        'p-4',
        'shadow-lg',
        'shadow-black/20'
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: []
}
