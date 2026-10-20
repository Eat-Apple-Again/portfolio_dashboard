import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Pages may only talk to these origins (blocks exfiltration even if a script gets injected)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://www.okx.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Production only: Vite dev server injects inline styles that a strict CSP would block
function csp_plugin(): Plugin {
  return {
    name: 'csp_meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  base: '/portfolio_dashboard/',
  plugins: [
    react(),
    tailwindcss(),
    csp_plugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple_touch_icon.png'],
      manifest: {
        name: 'Portfolio Dashboard',
        short_name: 'Portfolio',
        description: 'Personal investment dashboard',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        icons: [
          { src: 'icon_192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon_512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Precache app shell only; API responses (asset data) are never cached
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [],
      },
    }),
  ],
})
