# Ens Quests — Discord Quest Completer

أداة لإنجاز كويستات Discord تلقائياً (Rich Presence + Heartbeat).

---

## تشغيل المشروع

**اضغط زر Run ▶** في أعلى الصفحة — وبس. البرنامج يفتح تلقائياً في نافذة Preview.

---

## إذا واجهت مشكلة في التشغيل

### المشكلة الأكثر شيوعاً: الذاكرة ممتلئة
`rust-analyzer` (محلل Rust للـ Tauri backend) يستهلك ~5 GB من الذاكرة أحياناً. الحل:

1. افتح **Shell** (Terminal) من القائمة الجانبية
2. شغّل هذا الأمر:
   ```sh
   pkill -9 rust-analyzer; pkill -9 cargo; bun install
   ```
3. ثم اضغط **Run** مرة ثانية

### إذا node_modules مو موجودة
```sh
bun install
```

### إذا vite مو شغّال
```sh
rm -rf node_modules && bun install
```

---

## المتطلبات الأساسية (موجودة في Replit تلقائياً)

| أداة | الإصدار | الملاحظة |
|------|---------|----------|
| Bun  | 1.3.6   | مثبّت من Nix |
| Node | 20.x    | مثبّت من Nix |

**لا تحتاج** تثبيت أي شيء يدوياً — كل شيء موجود.

---

## لماذا Bun وليس npm/pnpm؟

- `pnpm` كان يحاول تحميل إصدار مختلف من نفسه (8.15.3) وكان يتعطل
- `npm install` يحتاج ~3-5 دقائق بسبب الحجم
- `bun install` يُكمل في أقل من 1 ثانية لما الحزم محلياً

---

## ملفات مهمة

```
src/
  pages/
    HomeView.vue       — الصفحة الرئيسية (Library + Quests)
    QuestsView.vue     — صفحة الكويستات
  composables/
    quest-manager.ts   — منطق الكويستات (fetch/enroll/heartbeat/claim)
    use-gateway.ts     — إدارة التوكنات وـ Discord Gateway
    fetch-gamelist.ts  — تحميل قاعدة بيانات الألعاب
    app-state.ts       — الحالة العامة للتطبيق
  assets/
    gamelist.json      — قاعدة بيانات احتياطية للألعاب
```

---

## User preferences

- لغة التواصل: عربي
- لا إيموجي في الكود
- اللعبة تُنشأ تلقائياً (synthetic) لو ما توجد في قاعدة البيانات
