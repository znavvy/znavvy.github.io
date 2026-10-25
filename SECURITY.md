# Security Policy

## Reporting Security Issues

Znavvy takes security seriously. If you discover a vulnerability or security issue, please do **not** disclose it publicly via GitHub Issues or Pull Requests.

Instead, please send an email to our core team or submit a private security advisory through GitHub:
- **Private Vulnerability Reporting:** Use the "Report a vulnerability" button under the **Security** tab of this repository.

## Architecture & Sensitive Data Guarantee

This public repository (`znavvy.github.io`) is strictly a **static compiled frontend artifact showroom**. 
- It contains **zero** server credentials, **zero** API secret tokens, and **zero** user or scraper session cookies.
- All harvesting bots, scrapers, autonomous video compositors, and social media posting agents execute strictly on private, local, and isolated runtime environments.
