# Frontend web và PWA

- `public/index.html`: admin tại `/`.
- `public/home.html`: operator/viewer tại `/app`.
- `public/login.html`: đăng nhập/đăng ký.
- `public/assets/`: JavaScript/CSS, AI panel, icon.
- `public/manifest.webmanifest`, `sw.js`, `offline.html`: PWA; chỉ cache tài nguyên giao diện, không cache API/lệnh.
- `styles.css`: nguồn Tailwind, build ra `public/assets/app.css`.

Tại gốc repo: `npm run build` hoặc `npm run css:watch`; `npm run dev` chạy Express phục vụ giao diện. Không cần dev server FE riêng. Điện thoại dùng cùng `/app`; muốn cài PWA qua mạng cần HTTPS. Đây không phải app Android/iOS native.
