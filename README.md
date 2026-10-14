# Plataforma Junta de Vecinos

## 1. Servidor (Node + Express + SQLite)
    cd server
    npm install
    npm start          # http://localhost:3001

Usuario de la directiva creado automáticamente:
  correo: directiva@junta.cl   contraseña: directiva123   (cámbiela antes de entregar)
Los vecinos se registran desde la página. Variable opcional: JWT_SECRET.

## 2. Cliente (React + Vite)
    npm create vite@latest client-app -- --template react
    cd client-app
    # copie client/src/App.jsx y client/src/api.js a src/
    npm install
    npm run dev

Si el servidor está en otra dirección, cree .env con VITE_API=https://su-servidor/api
