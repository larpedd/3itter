// Terms of Service and Privacy Policy pages. The text is a starting template that fills in
// this instance's name, domain, contact address and rules. Instance admins should review it.
import { html, el } from './lib/html.js';
import { state } from './store.js';
import { icon, topBar } from './ui.js';

const UPDATED = '5 November 2026';

function ctx() {
  const i = state.instance || {};
  const name = i.name || '3itter';
  const domain = i.domain || location.host;
  const contact = i.contactEmail
    ? html`<a class="link" href="mailto:${i.contactEmail}">${i.contactEmail}</a>`
    : html`the instance administrators (via a direct message or a report)`;
  return { name, domain, contact, minAge: i.minAge || 13, rules: i.rules || [] };
}

const section = (id, title, body) => html`<section class="doc-section" id="${id}"><h2 class="title-large emph">${title}</h2>${body}</section>`;

function termsBody() {
  const { name, domain, contact, minAge, rules } = ctx();
  return [
    section('agreement', '1. Agreement', html`
      <p>These Terms of Service (“Terms”) govern your use of <b>${name}</b>, the 3itter instance at <b>${domain}</b> (“the service”, “we”).
      By creating an account or using the service you agree to these Terms and to our <a class="link" href="/privacy">Privacy Policy</a>.
      If you don’t agree, don’t use the service.</p>`),
    section('eligibility', '2. Who can use it', html`
      <p>You must be at least <b>${minAge}</b> years old, or the minimum age of digital consent where you live if that is higher.
      You must be able to form a binding agreement and not be barred from using the service under applicable law.</p>`),
    section('account', '3. Your account', html`
      <ul>
        <li>Keep your password secret. You’re responsible for activity on your account.</li>
        <li>Your handle must not impersonate another person or organisation or mislead people about who you are.</li>
        <li>Tell us promptly if you think your account has been compromised. You can sign out other sessions from Settings → Account.</li>
      </ul>`),
    section('content', '4. Your content', html`
      <p>You keep ownership of what you post. You give us a worldwide, non-exclusive, royalty-free licence to store, display,
      reproduce and distribute your content <i>only</i> to operate and improve the service. That includes sending it to
      federated 3itter instances (see section 6). This licence ends when you delete the content or your account, except for
      copies already delivered to other instances or saved by other people.</p>
      <p>You’re responsible for what you post. Only post content you have the right to share.</p>`),
    section('rules', '5. Community rules', html`
      <p>When using ${name} you agree not to break the law or these rules:</p>
      <ol>${rules.map((r) => html`<li>${r}</li>`)}</ol>
      <p>You also agree not to attack the service, for example by trying to get around security measures, scraping it at scale,
      sending malware or overloading it.</p>`),
    section('federation', '6. Federation', html`
      <p>${name} can connect (“federate”) with other independent 3itter instances that the administrators approve.
      When you interact with people on another instance, your public profile, public posts and the interaction
      (for example a follow, like, repost, reply or direct message) are sent to that instance. Other instances are run by
      other people under their own terms. We can’t control or delete content once another instance has it,
      though we do send them deletion requests when you delete something.</p>`),
    section('moderation', '7. Moderation and enforcement', html`
      <p>Moderators may remove content, limit features or suspend accounts that break these Terms or the law. Where possible
      we will tell you why. Anyone can report a post or account. Reports go to this instance’s moderators. We may stop
      federating with any instance at any time.</p>`),
    section('termination', '8. Leaving', html`
      <p>You can export your data or delete your account at any time from Settings → Account. We may suspend or end your
      access if you seriously or repeatedly break these Terms. We may also close the service, and will try to give
      reasonable notice first.</p>`),
    section('disclaimers', '9. Disclaimers and liability', html`
      <p>The service is provided “as is” and “as available”, without warranties of any kind, to the fullest extent the law allows.
      We are not liable for indirect, incidental or consequential damages, or for content posted by users or other instances.
      Nothing in these Terms limits liability that cannot be limited by law, or your statutory rights as a consumer.</p>`),
    section('changes', '10. Changes', html`
      <p>We may update these Terms. If a change is significant we will give notice in the app before it takes effect.
      Continuing to use the service after that means you accept the new Terms.</p>`),
    section('contact', '11. Contact', html`<p>Questions about these Terms: ${contact}.</p>`),
  ];
}

function privacyBody() {
  const { name, domain, contact } = ctx();
  return [
    section('summary', 'The short version', html`
      <ul class="doc-highlights">
        <li>${icon('ad_off')}<span>No ads, no tracking scripts, no selling of data.</span></li>
        <li>${icon('cookie')}<span>One cookie, to keep you signed in. Theme preferences stay in your browser.</span></li>
        <li>${icon('public')}<span>Public posts are public, and can reach federated 3itter instances.</span></li>
        <li>${icon('lock')}<span>Direct messages are private but <b>not end-to-end encrypted</b>. Server administrators can technically read them.</span></li>
        <li>${icon('download')}<span>You can export or delete your data whenever you want.</span></li>
      </ul>`),
    section('controller', '1. Who we are', html`
      <p>This policy covers <b>${name}</b> at <b>${domain}</b>, run by its instance administrators. They decide how your data is processed.</p>`),
    section('collect', '2. What we collect', html`
      <ul>
        <li><b>Account data:</b> handle, display name, password (stored only as a salted scrypt hash), and your profile details: bio, location, website, avatar, banner, shape and colour.</li>
        <li><b>Passkeys:</b> if you add one, we store only its public key, a name, the provider ID and when it was last used. Your fingerprint, face or PIN never leaves your device.</li>
        <li><b>Content:</b> posts, images, replies, likes, reposts, bookmarks, follows, blocks, mutes and reports.</li>
        <li><b>Direct messages:</b> stored on this server so they can be delivered to you and the other person.</li>
        <li><b>Session data:</b> for each signed-in device, the browser’s user-agent, IP address and last-used time, so you can review and sign out sessions.</li>
        <li><b>Short-lived security data:</b> IP addresses kept in memory for a few minutes for rate limiting.</li>
      </ul>
      <p>We don’t collect your email, phone number, contacts or location unless you type them into your profile.</p>`),
    section('use', '3. How we use it', html`
      <p>Only to run the service: show your profile and posts, build timelines and notifications, deliver messages, keep accounts
      secure, prevent abuse and enforce the <a class="link" href="/terms">Terms</a>. The “For you” timeline ranks posts by
      likes, reposts, replies and age. It doesn’t profile you.</p>`),
    section('visibility', '4. What other people can see', html`
      <p>Your profile, posts, replies, reposts, likes, followers and following are <b>public</b> to anyone signed in to this instance and
      to federated instances. When someone shares a link to a post or profile, apps like Discord, Slack or iMessage
      can fetch a preview showing the public post, its images and your public profile details. Posts behind a content warning or marked
      sensitive are previewed without their text and images. Bookmarks, blocks, mutes, reports and settings are private. If you turn off “Show me in suggestions”,
      people can still find you by your exact handle.</p>`),
    section('federation', '5. Federation', html`
      <p>When you follow, reply to, mention, like, repost or message someone on another 3itter instance, we send the needed data to
      that instance: your public profile, the post or interaction, and the message text for direct messages. Your followers’ instances
      receive your public posts and profile updates. Those instances are run independently and store data under their own policies.
      When you delete a post or your account we ask federated instances to delete their copies, but we can’t guarantee that they do.</p>`),
    section('cookies', '6. Cookies and local storage', html`
      <p>We use one strictly necessary, HttpOnly session cookie. Your theme, colour, text size and motion preferences are stored in your
      browser’s local storage and never sent to us. Fonts and icons are loaded from Google Fonts, which receives your IP address
      when they are downloaded.</p>`),
    section('retention', '7. How long we keep data', html`
      <ul>
        <li>Content and account data are kept until you delete them.</li>
        <li>Deleted posts are removed from public view immediately, and their text and images are cleared.</li>
        <li>When you delete your account we remove your posts, likes, follows, messages and sessions, and anonymise the account record.</li>
        <li>Sessions expire after 30 days, or straight away when you sign out.</li>
        <li>Moderation reports and the admin audit log are kept as long as needed to keep the service safe.</li>
      </ul>`),
    section('rights', '8. Your rights', html`
      <p>Depending on where you live (for example under the GDPR or CCPA) you may have the right to access, correct, export or delete your
      data, and to object to or restrict processing. You can do most of this yourself in Settings → Account: edit your profile,
      <b>Download your data</b> and <b>Delete account</b>. For anything else, contact ${contact}. You may also complain to your
      local data protection authority.</p>`),
    section('security', '9. Security', html`
      <p>Passwords are hashed with scrypt. Session tokens are stored only as hashes. Requests between federated instances are signed
      with Ed25519 keys. No system is perfectly secure, so please use a unique password.</p>`),
    section('children', '10. Children', html`<p>The service isn’t meant for children under the minimum age in the <a class="link" href="/terms">Terms</a>. If you think a child has an account, report it.</p>`),
    section('changes', '11. Changes', html`<p>We’ll post changes to this policy here and update the date below. Significant changes will be announced in the app.</p>`),
    section('contact', '12. Contact', html`<p>Privacy questions or requests: ${contact}.</p>`),
  ];
}

function docView(kind, { standalone = false } = {}) {
  const { name } = ctx();
  const title = kind === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  const body = kind === 'terms' ? termsBody() : privacyBody();
  const root = el(html`<div class="view doc-view${standalone ? ' standalone' : ''}">
    ${standalone
    ? html`<header class="doc-top"><a class="brand" href="/"><span class="brand-mark shape-sunny"></span><span class="brand-name">${name}</span></a>
        <a class="btn tonal" href="/">${icon('arrow_back', 'sm')}Back</a></header>`
    : topBar({ back: true, title, sub: name })}
    <article class="doc card">
      <div class="doc-hero">
        <span class="doc-art shape-${kind === 'terms' ? 'clover4' : 'cookie9'}">${icon(kind === 'terms' ? 'gavel' : 'shield_lock')}</span>
        <div><h1 class="headline-large emph">${title}</h1><p class="doc-updated">Last updated ${UPDATED}</p></div>
      </div>
      ${body}
      <p class="doc-switch">${kind === 'terms' ? html`See also the <a class="link" href="/privacy">Privacy Policy</a>.` : html`See also the <a class="link" href="/terms">Terms of Service</a>.`}</p>
    </article>
  </div>`);
  return { el: root, title };
}

export const termsView = (opts) => docView('terms', opts);
export const privacyView = (opts) => docView('privacy', opts);
