# Publishing Convertify (free options)

Convertify needs a real server (FFmpeg + disk + CPU). Netlify, Vercel, GitHub Pages and Firebase Hosting only host static
files, so they CANNOT run it. Use one of these:

| Option | Best for | Limits |
|---|---|---|
| A. Render (free) | Quick public demo | 512 MB RAM, 0.1 CPU, sleeps after 15 min idle, files/accounts lost on restart. Only small files. |
| B. Oracle Cloud Always Free VM | Real use, big files | Card needed for sign-up (not charged). Free Arm VM is now 2 CPU / 12 GB RAM, 200 GB disk. Setup is manual. "Out of capacity" errors are common. |
| C. Your own PC + Cloudflare tunnel | Testing with friends | Only online while your PC is on. Cloudflare limits uploads to about 100 MB. |

## Settings (environment variables)
MAX_UPLOAD_GB  biggest upload per file (default 10). Use 0.1 for Render, 1-2 for Oracle.
MAX_JOBS       conversions running at once (default unlimited). Use 1 on Render, 2 on Oracle.
PORT           set automatically by most hosts (default 5000).

## Test production mode on your PC first
npm run install:all
npm run build
npm start          -> open http://localhost:5000  (one server serves the website AND the API)

## A. Render
1. Create a GitHub account, make a new repository, upload this project (the .gitignore keeps junk out).
2. Create a Render account (render.com) and connect GitHub.
3. New + > Web Service > pick your repository. Settings:
   Runtime Node | Build: npm run install:all && npm run build | Start: npm start | Instance type: Free
   Environment: MAX_UPLOAD_GB=0.1 and MAX_JOBS=1 (or use the included render.yaml as a Blueprint)
4. Deploy. You get https://your-name.onrender.com

## B. Oracle Cloud (always on, bigger files)
1. Sign up at cloud.oracle.com (free tier). Create instance: Ubuntu 22.04, shape VM.Standard.A1.Flex (2 OCPU / 12 GB), add your SSH key, public IP on.
2. In the VM's network (VCN > Security List) add ingress rules for TCP ports 80 and 443.
3. SSH in (ssh ubuntu@PUBLIC_IP) and run:
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   sudo apt update && sudo apt install -y curl unzip
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
4. Copy convertify.zip to the VM (scp convertify.zip ubuntu@PUBLIC_IP:~), then:
   unzip convertify.zip && cd convertify && npm run install:all && npm run build
   sudo npm i -g pm2
   cd server && MAX_UPLOAD_GB=2 MAX_JOBS=2 pm2 start index.js --name convertify
   pm2 save && pm2 startup     (run the command it prints)
5. Free domain: duckdns.org > create a name > point it to PUBLIC_IP.
6. HTTPS with Caddy: install Caddy (caddyserver.com/docs/install#debian-ubuntu-raspbian), then put this in /etc/caddy/Caddyfile
   yourname.duckdns.org {
       reverse_proxy localhost:5000
   }
   sudo systemctl reload caddy      -> https://yourname.duckdns.org

## C. Your PC + Cloudflare tunnel
npm run build && npm start
Download cloudflared (github.com/cloudflare/cloudflared/releases), then: cloudflared tunnel --url http://localhost:5000
It prints a https://something.trycloudflare.com link anyone can open (changes every run).

## Appear on Google
1. Publish first (A or B). Google can only list a public https address.
2. search.google.com/search-console > Add property > URL prefix > your address > verify (HTML tag method: paste the tag into client/index.html <head>, rebuild, redeploy).
3. Create client/public/sitemap.xml:
   <?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://YOUR-ADDRESS/</loc></url></urlset>
   and add a line  Sitemap: https://YOUR-ADDRESS/sitemap.xml  to client/public/robots.txt. Redeploy, then submit the sitemap in Search Console.
4. URL Inspection > Request indexing. It usually takes days to weeks. Render's free plan sleeps and blocks robots.txt while asleep, so Oracle (always on) is better for Google.

## Before going public
- Users can upload anything, so keep MAX_UPLOAD_GB and MAX_JOBS low, and watch disk space.
- Add a short Privacy / Terms note (files are deleted after 1 hour; do not upload things you have no right to convert).
- Login is simple (users.json). Fine for a start; use a real auth service later.
