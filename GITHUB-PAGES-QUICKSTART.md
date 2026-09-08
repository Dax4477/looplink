# GitHub Pages quick start

## No build required

This project is plain:

- HTML
- CSS
- JavaScript

GitHub Pages can serve it directly.

## Test locally before GitHub

Microphone APIs require a secure origin. `localhost` counts as secure, so you can test with Python:

```powershell
cd "C:\LoopLink\LoopLink-Web-GitHub-Pages"
py -m http.server 8088
```

Open:

`http://localhost:8088`

For testing on another phone, do **not** use plain LAN HTTP because browser microphone permission normally requires HTTPS. Upload to GitHub Pages first.

## GitHub web-only upload

If you do not want to use Git commands:

1. Create a new empty GitHub repository.
2. Choose **Add file → Upload files**.
3. Drag all files from this folder into GitHub.
4. Commit to `main`.
5. Open **Settings → Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Choose `main` and `/ (root)`.
8. Save.
9. Wait for GitHub to publish the HTTPS Pages URL.
