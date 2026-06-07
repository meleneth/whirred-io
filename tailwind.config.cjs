/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: ['./docs/**/*.{md,vue,ts}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: []
}
