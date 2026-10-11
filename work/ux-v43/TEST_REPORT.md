# Test raporu — 22 Eylül 2026

Taban: `eaa8fae9c243e02b0d9fff2f3b0702379b26a6c6`, uygulama v43.

| Test | Sonuç | Gerçekte ölçülen kapsam |
|---|---:|---|
| `node tests/test_button_theme.cjs` | 21/21 | Renk doğrulama, kontrast, 20.000 deterministik renk örneği, üç buton durumu, enjekte edilmiş tercih deposu |
| `python tests/test_prepare.py` | 9/9 | Sentetik paket üzerinde eksik dosya/hash/path kontrolü, sürüm koruması, aday manifest doğruluğu |
| `python tests/test_workspace.py` | 22/22 | Chromium'da sentetik DOM; özgün kontrol/canvas kimliği, komut dinleyicisi, görev menüleri, tema, mobil yerleşim ve geri alma |

Toplam: **52 kontrol geçti, 0 başarısız.** Chromium DOM testinde 320×568, 390×844,
768×1024, 1280×900 ekranlar kullanıldı. Önceki oturum raporları bu toplama dahil değil.

## Henüz ölçülmeyenler

Tam v43 uygulamasının çizim/veri regresyonu, gerçek origin IndexedDB ve localStorage
yeniden açılışı, PDF/kamera/OCR/planlayıcı/sunucu eşitlemesi, offline paket kurulumu
ve v43→yeni sürüm güncellemesi, fiziksel Apple Pencil / Android kalem davranışı.

GitHub tabanında uygulamanın çağırdığı `ui.css` ve offline paketin vendor/ikon
varlıkları yok. Bu eksik dağıtım bütünüyle çalıştırılmadı; eksiklere rağmen yayın
hazır raporu üretilmedi. `prepare.py` tam v43 varlıkları olmadan aday üretmeyi reddeder.

Ana uygulama kaynakları, PWA dosyaları, mevcut notlar ve canlı yayın değiştirilmedi.
