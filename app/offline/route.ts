// Self-contained Arabic offline page (precached by public/sw.js). It needs no
// framework chunks, and renders the trainee's last saved program and nutrition
// from the plan cache. All text is inserted with textContent (no HTML injection).
const page = `<!doctype html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>غير متصل | إيزي كوتش</title>
<style>
:root{--bg:#f0f2f3;--card:#fafbfa;--text:#202a35;--muted:#63707c;--line:#dce2e4;--primary:#2858a6;--on:#fff}
:root[data-theme="dark"]{--bg:#0b1220;--card:#111c2c;--text:#e6edf8;--muted:#a8b8cf;--line:#31435b;--primary:#2a63d4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 system-ui,"Segoe UI",Tahoma,sans-serif;padding:16px 16px calc(24px + env(safe-area-inset-bottom))}
main{max-width:640px;margin:0 auto}h1{font-size:1.35rem;margin:.5rem 0}h2{font-size:1.05rem;margin:0 0 .5rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0}
.muted{color:var(--muted);font-size:.875rem}.row{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{border:1px solid var(--line);border-radius:8px;padding:2px 8px;font-size:.8rem}
button{min-height:44px;border:0;border-radius:12px;background:var(--primary);color:var(--on);font:inherit;font-weight:600;padding:0 18px;cursor:pointer}
ol{margin:0;padding-inline-start:1.2rem}li{margin:.4rem 0}bdi{unicode-bidi:isolate}
</style>
</head>
<body>
<main>
<p class="muted">إيزي كوتش</p>
<h1>أنت غير متصل بالإنترنت الآن</h1>
<p class="muted" id="status">نحاول عرض آخر نسخة محفوظة من برنامجك على هذا الجهاز…</p>
<button type="button" id="retry">إعادة المحاولة</button>
<div id="plan"></div>
</main>
<script>
(function(){
  try { if (/(?:^|; )ec_theme=light/.test(document.cookie)) document.documentElement.dataset.theme = "light"; } catch (e) {}
  var en = false;
  try { en = /(?:^|; )ec_language=en/.test(document.cookie); } catch (e) {}
  var T = en ? {
    title: "You're offline right now", retry: "Try again", loading: "Trying to show the last saved copy of your program on this device…",
    none: "There's no saved copy of your program on this device yet. Open your portal once while online, then you can see today's workout without internet.",
    saved: "This is the last saved copy", later: ". New entries need a connection.", today: "Today's workout · ", coach: "With your coach ",
    sets: " sets", reps: " reps", rest: " s rest", kg: " kg", food: "Daily nutrition", kcal: " kcal", p: "Protein ", c: "Carbs ", f: "Fat ", g: " g",
    error: "Couldn't read the saved copy. Try again when you're online."
  } : {
    title: "أنت غير متصل بالإنترنت الآن", retry: "إعادة المحاولة", loading: "نحاول عرض آخر نسخة محفوظة من برنامجك على هذا الجهاز…",
    none: "ما فيه نسخة محفوظة من برنامجك على هذا الجهاز بعد. افتح بوابتك مرة وأنت متصل، وبعدها تقدر تشوف تمارين اليوم بدون إنترنت.",
    saved: "هذه آخر نسخة محفوظة", later: ". التسجيلات الجديدة تحتاج اتصالًا.", today: "تمارين اليوم · ", coach: "مع مدربك ",
    sets: " مجموعات", reps: " عدات", rest: " ثانية راحة", kg: " كجم", food: "التغذية اليومية", kcal: " سعرة", p: "بروتين ", c: "كارب ", f: "دهون ", g: " غ",
    error: "تعذر قراءة النسخة المحفوظة. أعد المحاولة عند توفر الاتصال."
  };
  if (en) { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; document.title = "Offline | EasyCoach"; }
  document.querySelector("h1").textContent = T.title;
  var retry = document.getElementById("retry");
  retry.textContent = T.retry;
  retry.addEventListener("click", function(){ location.href = "/me"; });
  var root = document.getElementById("plan"), status = document.getElementById("status");
  status.textContent = T.loading;
  function el(tag, text, cls){ var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function chip(parent, text){ parent.appendChild(el("span", text, "chip")); }
  fetch("/api/offline-plan", { credentials: "same-origin" }).then(function(r){ return r.json(); }).then(function(data){
    var plans = (data && data.plans) || [];
    if (!plans.length) { status.textContent = T.none; return; }
    var updated = data.generated_at ? new Date(data.generated_at).toLocaleString(en ? "en-GB" : "ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "";
    status.textContent = T.saved + (updated ? " (" + updated + ")" : "") + T.later;
    var weekday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).getDay();
    plans.forEach(function(plan){
      if (plan.program) {
        var days = plan.program.days || [];
        var today = days.filter(function(d){ return d.weekday === weekday; });
        var card = el("section", null, "card");
        card.appendChild(el("h2", today.length ? T.today + plan.program.name : plan.program.name));
        if (plan.coach) card.appendChild(el("p", T.coach + plan.coach, "muted"));
        (today.length ? today : days).forEach(function(day){
          card.appendChild(el("h2", day.name));
          var list = el("ol");
          (day.exercises || []).forEach(function(ex){
            var item = el("li", ex.name), row = el("div", null, "row");
            chip(row, ex.sets + T.sets); chip(row, ex.reps + T.reps); chip(row, ex.rest + T.rest);
            if (ex.weight != null) chip(row, ex.weight + T.kg);
            item.appendChild(row); list.appendChild(item);
          });
          card.appendChild(list);
        });
        root.appendChild(card);
      }
      if (plan.nutrition) {
        var n = plan.nutrition, food = el("section", null, "card");
        food.appendChild(el("h2", T.food));
        var row = el("div", null, "row");
        chip(row, n.calories + T.kcal); chip(row, T.p + n.protein + T.g); chip(row, T.c + n.carbs + T.g); chip(row, T.f + n.fat + T.g);
        food.appendChild(row);
        if (n.text) food.appendChild(el("p", n.text));
        (n.meals || []).forEach(function(m){ food.appendChild(el("p", m.name + (m.time ? " · " + m.time : "") + (m.foods ? ": " + m.foods : ""))); });
        root.appendChild(food);
      }
    });
  }).catch(function(){ status.textContent = T.error; });
})();
</script>
</body>
</html>`;

export function GET() {
  return new Response(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
