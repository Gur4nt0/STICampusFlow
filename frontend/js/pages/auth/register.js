/* ==========================================================================
   pages/auth/register.js — Create your account page (#/register) for new students
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, toast, busy, S, defineRoute, authFrame, signedIn, domainText } = App;

  /* ---------- new student account */
  defineRoute('/register', () => {
    const minLen = (S.cfg && S.cfg.minPasswordLength) || 8;
    authFrame(`
      <h2 style="font-size:1.7rem">Create your account</h2>
      <p class="muted" style="margin:.4rem 0 1.2rem">Use the school email you actually read (${esc(domainText())}). Every reminder and update is sent there.</p>
      <form class="form-grid" id="regForm" novalidate>
        <div class="field full"><label for="r1">Full name</label><input class="input" id="r1" name="fullName" autocomplete="name" placeholder="Juan Dela Cruz" required></div>
        <div class="field full"><label for="r2">Student number</label><input class="input" id="r2" name="studentNo" inputmode="numeric" maxlength="11" placeholder="11 digits, e.g. 02000123456" required><span class="hint">It is printed on your school ID.</span></div>
        <div class="field full"><label for="r3">School email</label><input class="input" id="r3" name="email" type="email" autocomplete="email" placeholder="lastname.123456@globalcity.sti.edu.ph" required></div>
        <div class="field"><label for="r4">Program</label><select class="input" id="r4" name="program">
          <option value="">Choose your program</option>${['BS Information Technology', 'BS Computer Science', 'BS Computer Engineering', 'BS Tourism Management', 'BS Hospitality Management', 'BS Business Administration', 'BS Accountancy', 'Senior High School'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="r5">Year level</label><select class="input" id="r5" name="yearLevel"><option value="">—</option>${[1, 2, 3, 4, 5].map((y) => `<option value="${y}">${y}</option>`).join('')}</select></div>
        <div class="field full"><label for="r6">Password</label><input class="input" id="r6" name="password" type="password" autocomplete="new-password" data-strength required><span class="hint">At least ${minLen} characters, with a letter and a number.</span></div>
        <div class="field full"><label for="r7">Repeat password</label><input class="input" id="r7" name="password2" type="password" autocomplete="new-password" data-match="#r6" required></div>
        <div class="field full"><label for="r8">Personal email for notices (optional)</label><input class="input" id="r8" name="notifyEmail" type="email" autocomplete="email" placeholder="yourname@gmail.com"><span class="hint">School Outlook inboxes often file our notices as junk. Add a Gmail or other personal address and we'll send them there instead. We'll email a code to confirm it.</span></div>
        <button class="btn btn-primary btn-lg btn-block full" type="submit">Create account</button>
        <a class="link-btn small full" href="#/login" style="justify-self:start">I already have an account</a>
      </form>`);
    const f = $('#regForm');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (f.password.value !== f.password2.value) return toast('The two passwords do not match.', 'error');
      if (App.passwordStrength(f.password.value).level === 0) { f.password.focus(); return toast('Your password is too weak. ' + App.passwordStrength(f.password.value).tip, 'error'); }
      busy(f.querySelector('button[type=submit]'), async () => {
        const r = await API.post('/api/auth/register', {
          fullName: f.fullName.value, studentNo: f.studentNo.value, email: f.email.value,
          program: f.program.value, yearLevel: f.yearLevel.value, password: f.password.value,
          notifyEmail: f.notifyEmail.value,
        });
        toast('Welcome to CampusFlow!', 'success');
        signedIn(r.user);
      });
    };
  }, { public: true });
})();
