# Zendesk Change Watch

A private Zendesk Support app (`support.nav_bar`) that shows configuration changes from your Audit Logs, lets each admin set personal alerts, and lets you ask the person who made a change why they made it. Built with React, TypeScript and Zendesk Garden. It has **no external backend**: everything runs in the browser, inside Zendesk.

- **Activity:** configuration changes from the Audit Logs API, with filters and 10 records per page.
- **My Alerts:** personal alert rules with unread tracking and automatic deduplication.
- **Clarifications:** questions linked to an audit event, with replies and requester-only "Mark Resolved".

## Requirements

- A Zendesk account with **Audit Logs API** access (Enterprise plans) and **Custom Objects**. Use a sandbox first.
- [Node.js](https://nodejs.org/) 20 or newer and npm.
- [Zendesk CLI (ZCLI)](https://developer.zendesk.com/documentation/apps/getting-started/using-zcli/):

  ```bash
  npm install -g @zendesk/zcli
  ```

## Install

```bash
git clone https://github.com/Grjhoan/zendesk_app_change_watch.git
cd zendesk_app_change_watch
npm install
```

## Check and build

```bash
npm test          # 11 automated tests
npm run build     # type check, build and prepare the ZAF bundle in dist/
```

## Run it in Zendesk

1. Log in to ZCLI with your own Zendesk account (it asks for your subdomain and an API token or browser login):

   ```bash
   zcli login -i
   ```

2. Serve the built app locally:

   ```bash
   npm run zcli:server
   ```

3. Open Zendesk Support in your browser and add `?zcli_apps=true` to the URL, for example `https://YOUR-SUBDOMAIN.zendesk.com/agent/?zcli_apps=true`. Zendesk asks you to allow the local app. Then open **Zendesk Change Watch** in the left navigation bar.

## Create the Custom Objects

The app stores its own data in four Custom Objects: `cw_alert_rule`, `cw_alert_read_state`, `cw_clarification_thread` and `cw_clarification_reply`. The schema is in [`schema/custom-objects.json`](./schema/custom-objects.json). Pick one way to create them (both are safe to repeat):

- **From the app (recommended):** open **Setup & Diagnostics** and click **Create / Repair Custom Objects**. It uses your signed-in session.
- **From the command line:**

  ```bash
  # Preview only, nothing is created
  node scripts/setup-custom-objects.mjs --dry-run

  # Create what is missing
  ZENDESK_SUBDOMAIN=your-subdomain ZENDESK_EMAIL=you@example.com ZENDESK_API_TOKEN=your-token npm run setup:objects
  ```

  Never commit your credentials. Pass them as environment variables only.

## Install it as a private app

```bash
npm run zcli:validate
npm run zcli:package
```

Then go to **Admin Center → Apps and integrations → Apps → Zendesk Support apps → Actions → Upload private app**, and upload the `.zip` that ZCLI created. Access is controlled in Admin Center; the app has no role checks of its own.

## Limits

- Alerts are visual and appear only while the app is open or visible. There are no email, Slack or push notifications.
- Zendesk permissions, quotas and Audit Logs retention apply.
- This is a development base, not a certified Zendesk Marketplace product. Review the code and permissions with your teams and test in a sandbox before using it in production. You are responsible for your own Zendesk configuration and access controls.

## Contact

Name: Jhoan Zabala  
Email: jzabalacx@gmail.com  
Website: [www.jhoanzabala.com](https://www.jhoanzabala.com)  
Project Manager / Product Owner / Zendesk Admin
