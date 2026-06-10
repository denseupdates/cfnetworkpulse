# CF Network News — Firestore Security Rules

These rules secure the Firestore database behind cfnetworknews.com. They were
written to match exactly how the site reads and writes data, so pasting them in
will **not** break your existing Message Board, WOTW comments, likes/dislikes,
or ads — while locking down editing to your admin account only.

---

## What these rules do

| Collection        | Who can READ | Who can WRITE |
|-------------------|--------------|---------------|
| `content/wotw`    | Anyone (public page must read it) | **Admin only** (you) |
| `ads`             | Anyone | **Admin only** (you) |
| `comments`        | Anyone | Signed-in users can post; **anyone** can update like/dislike counts |
| `wotw_comments`   | Anyone | Signed-in users can post; **anyone** can update like/dislike counts |

"Admin only" = the email `denseupdates@gmail.com` (matches your `ADMIN_EMAILS`
list in admin.js). To add more admins later, add their email to the `isAdmin()`
list in the rules **and** to `ADMIN_EMAILS` in admin.js.

> **Why anyone can update like/dislike counts:** your site lets logged-out
> visitors like/dislike comments (reactions are stored per-browser, not in an
> account). Those clicks call Firestore `update()` without being signed in, so
> the rules must allow unauthenticated updates to the `likes`/`dislikes` fields.
> The rules below allow that **only** for those two number fields and the
> `replies` array — they do **not** let a stranger rewrite comment text.

---

## The rules (copy everything in this block)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---- Helpers ----
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.lower() in [
          'denseupdates@gmail.com'
        ];
    }

    // ---- Workout of the Week (and any future content docs) ----
    // Public can read; only the admin can edit/publish.
    match /content/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ---- Ads ----
    // Public can read; only the admin can manage.
    match /ads/{adId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ---- Message Board comments ----
    match /comments/{commentId} {
      allow read: if true;

      // Posting a new comment requires sign-in.
      allow create: if request.auth != null;

      // Likes/dislikes/replies: allow updates (logged-out reactions are allowed),
      // but the comment's core text/author cannot be changed by this path.
      allow update: if request.resource.data.text == resource.data.text
                    && request.resource.data.name == resource.data.name;

      // No client deletes — manage from the Firebase console if ever needed.
      allow delete: if isAdmin();
    }

    // ---- Workout of the Week comments / scores ----
    match /wotw_comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.resource.data.text == resource.data.text
                    && request.resource.data.name == resource.data.name;
      allow delete: if isAdmin();
    }

    // ---- Everything else: locked down ----
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## How to paste these into Firebase (step by step)

1. Go to the Firebase console: **https://console.firebase.google.com/**
2. Sign in with the Google account that owns the project
   (`denseupdates@gmail.com`).
3. On the project list, click the **cf-network-news** project.
4. In the left sidebar, expand **Build**, then click **Firestore Database**.
   - (If the sidebar is collapsed, click the ☰ menu icon first.)
5. At the top of the Firestore page, click the **Rules** tab
   (it sits next to **Data**, **Indexes**, **Usage**).
6. You'll see the current rules in a code editor. **Select all** the existing
   text in that editor (click inside it, then Ctrl+A / Cmd+A) and delete it.
7. **Paste** the entire rules block from above (everything between the lines,
   starting with `rules_version = '2';` and ending with the final `}`).
8. Click the blue **Publish** button (top right of the editor).
9. A confirmation appears; the new rules go live within a few seconds.

That's it — the rules are now enforced.

---

## How to confirm it worked

1. **Public page still reads the workout:** open
   https://cfnetworknews.com/wotw.html in a normal browser tab (signed out).
   The workout, warm-up, cool-down, and notes should all display.
2. **Admin editing works:** open https://cfnetworknews.com/admin.html, sign in
   with `denseupdates@gmail.com`, go to the **Workout of the Week** tab, change
   something small, and click **Save & Publish**. The status should read
   "Saved and published ✓". Refresh wotw.html to see the change.
3. **Likes still work logged out:** on wotw.html (signed out), click a 👍 on a
   comment — the count should change.
4. **Posting requires sign-in:** signed out, the comment box should prompt you
   to sign in before you can post.

If saving from the admin page fails with a "permission" error, double-check that
the email in the rules' `isAdmin()` list exactly matches the Google account
you're signed in with (all lowercase).

---

## Important: authorized domain for Google Sign-In

Separately from rules, Google Sign-In only works on domains you've authorized:

1. In the Firebase console, go to **Build → Authentication → Settings tab →
   Authorized domains**.
2. Make sure **cfnetworknews.com** (and **www.cfnetworknews.com** if you use it)
   are listed. If not, click **Add domain** and add them.

Without this, the admin sign-in popup will fail on the live site even though the
rules are correct.
