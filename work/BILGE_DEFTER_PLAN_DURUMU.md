# Bilge Defter — uygulama sırası ve kanıt durumu

Bu not, 20 Eylül 2026 tarihli Not Alma Programı konuşmasında görünen aşama sırasına dayanır. Özgün 37 iş kalemi / 36 test içeren ZIP bu çalışma alanında ve kontrol edilen İndirilenler konumunda bulunmadı; bu belge o paketin yerine geçtiği iddiasını taşımaz.

## Güncel dilim: v36 — kâğıt düzeni, basınçlı kalem, parola onayı

- Sayfa bazlı desen: Çizgili/Kareli/Noktalı/Çizgisiz (yalnız açık sayfa; kopya/taşıma/yedek korunur; eski sayfalar Çizgili; bilinmeyen değer fail-closed). Kalem basınca duyarlı: genişlik × (0.4 + 1.2×basınç), basınçsız cihazlar eski davranışta. Yedekleme parolası iki kez sorulur (boş onay atlama boşluğu kapatıldı). Görsel ön doğrulama önek denetimine gevşetildi (güvenlik başlık+IHDR'de korunur).
- 26 uygulama paketi 258 kontrol + fixture'lar geçti. Canlı iki origin v36: releases/20260921-v36-paper-patterns; rollback-before-v36. SHA256SUMS c194d58bb5ece6d960c8a82693540322848d9261f171bc32dde3a1c9dbe56c35. Ayrıntı: outputs/BILGE_DEFTER_V36.md.
- Sıradaki iş: push bildirimi, el yazısı tanıma / Türkçe-tıbbi sözlük, AI (kullanıcı önceliğine göre). Fiziksel tablet (kalem basıncı, kamera, eşitleme) kabulü bekliyor.

## Önceki dilim: v35 — otomatik uçtan uca şifreli eşitleme

- "Eşitlemeyi aç" oturum kilidi (parola sunucu yedeğiyle doğrulanır, saklanmaz). 5 sn denetim: temiz+yerel değişiklik → otomatik push; sunucu yeni+temiz → otomatik pull; iki taraf değişti → çakışma bandı (sunucu/yerel/30 dk ertele) manuel seçim. Zaman damgası localStorage'da; özel adreste kapalı.
- keyFor parola+tuz anahtarlı cache (farklı tuzlu yedekte yanlış anahtar bugı kapatıldı).
- 24 uygulama paketi 245 kontrol + fixture'lar geçti. Canlı iki origin v35: releases/20260921-v35-auto-sync; rollback-before-v35. SHA256SUMS 0d3b42720dda0f7c4e328ea0cbf844f620269322c6d28aef097222244c9c331b. Ayrıntı: outputs/BILGE_DEFTER_V35.md.
- Sıradaki iş: push bildirimi veya el yazısı tanıma/Türkçe-tıbbi sözlük (kullanıcı önceliğine göre). Fiziksel iki cihaz eşitleme kabulü + tablet kabulü bekliyor.

## Önceki dilim: v34 — kamerayla fotoğraf çekme ve üzerine not alma

- Araçlar → Fotoğraf çek (mobilde capture=environment ile doğrudan kamera, masaüstünde seçici). Fotoğraf ilk yerleşim akışıyla sayfaya girer; kalem/fosforlu/silgi not katmanında çalışır, fotoğraf bozulmaz. Ortak processMediaFile (EXIF + sınırlar). Şema değişmedi.
- 23 uygulama paketi 239 kontrol + fixture'lar geçti. Canlı iki origin v34: releases/20260921-v34-camera; rollback-before-v34. SHA256SUMS 0ab65c22c83620934de5cfebcac97b380f91bd803bc3276ee972b8335a601dd0. Ayrıntı: outputs/BILGE_DEFTER_V34.md.
- Sıradaki iş: otomatik cihazlar arası eşitleme (şifreli push/pull, oturum kilidi, zaman damgası, çakışmada manuel seçim). Fiziksel tablet kabulü (kamera dahil) bekliyor.

## Önceki dilim: v33 — manuel uçtan uca şifreli sunucu yedeği

- Yedek penceresinde "Sunucuya yedekle / Sunucudan yükle" (yalnız davetli adres; özel adreste gizli + açıklama). PBKDF2-SHA256 250k + AES-256-GCM; parola saklanmaz; sunucu yalnız şifreli yığın görür (başlıksız istek 401 fail-closed). Yükleme mevcut önizleme/onay akışını kullanır; yanlış parola/404 dürüst mesaj.
- Sunucu: POST/GET /api/v1/bilge-defter/backup, bilge_defter_backups (upsert, 5 MB sınır). Codex-server commit 219e0d2; 14 pytest.
- 22 uygulama paketi 235 kontrol + fixture'lar geçti. Canlı iki origin v33: releases/20260921-v33-server-backup; rollback-before-v33. SHA256SUMS 745d8e568971e63135a673cb0c4594847b31705beb686173c66a4f21bda28828. Ayrıntı: outputs/BILGE_DEFTER_V33.md.
- Sıradaki iş: otomatik cihazlar arası eşitleme (açılışta şifreli push/pull, zaman damgası, çakışmada manuel seçim). Fiziksel tablet kabulü bekliyor.

## Önceki dilim: v32 — hesap/kimlik altyapısı

- Sunucu (linux-ai-server): GET /api/v1/bilge-defter/whoami — Cloudflare Access JWT doğrulaması (RS256 + aud/iss, JWKS önbellekli), e-posta döner, bilge_defter_users'a upsert; başlıksız istekte cihaz kimliği; eksik env fail-closed. 7 pytest. Codex-server commit bf5846b; env: BILGE_DEFTER_ACCESS_TEAM/AUD.
- Uygulama: Kurulum ekranında hesap satırı (davetli adreste doğrulanmış e-posta, özel adreste cihaz kimliği, hatada dürüst açıklama). Not verisi sunucuya GÖNDERİLMEZ.
- Rota: /api/v1/bilge-defter/* → 172.17.0.1:8420 (nginx her iki profile); CORS'a davetli adres eklendi.
- 21 uygulama paketi 230 kontrol + fixture'lar geçti. Canlı iki origin v32: releases/20260921-v32-identity; rollback-before-v32. SHA256SUMS ef7738d630cc38b6d7f233cd136a53dda77103da8de340b76c2b38f6bab76302. Ayrıntı: outputs/BILGE_DEFTER_V32.md.
- Sıradaki iş: manuel uçtan uca şifreli sunucu yedeği (Sunucuya yedekle/yükle), ardından otomatik eşitleme. Fiziksel tablet kabulü bekliyor.

## Önceki dilim: v31 — planlayıcı hatırlatma (açık uygulama) ve izin akışı

- Kayıt bazlı "Hatırlatma" (saat şartı), izin durumu satırı ve izin butonu, 60 s zamanlayıcı, uygulama içi balon + desteklenen cihazlarda sistem bildirimi (gün bazlı etiket, aynı dakikada tekrar yok). Tekrarlı kayıtlarda done/skip günler hatırlatmaz.
- Dürüst sınır: uygulama kapalıyken bildirim yok (sunucu/push yok); iOS desteklemiyor — arayüzde açıkça yazılı. Hatırlatma cihazın yerel saatinden hesaplanır.
- Şema sürümü değişmedi (v6/8); remind booleandır, eski uygulamalar alanı zararsız korur.
- 20 uygulama paketi 228 kontrol + fixture'lar geçti. Canlı iki origin v31: releases/20260921-v31-reminders; rollback-before-v31 tutuldu. SHA256SUMS 49272e9b139326a08e7e211cd2899a41f1484fac5ed33940295c755ca7f4e1e1. Ayrıntı: outputs/BILGE_DEFTER_V31.md.
- Sıradaki iş: hesap + cihazlar arası eşitleme (push bildirimi ancak onunla anlamlı). Fiziksel tablet kabulü bekliyor.

## Önceki dilim: v30 — haftalık tekrar ve haftalık görünüm

- Formda "Haftalık tekrar" ve "her N hafta" (1–52). Tekrar seçilen tarihten başlar; her görünüm ayrı kayıttır ve gün bazlı tamamlanır/atlanır. Düzenle seriyi günceller; Seriyi sil tümünü Silinenler'e taşır; tekrar kaldırılırsa kayıt tek seferlik olur.
- Haftalık görünüm: yedi gün sütunu (tamamlanan/toplam, planlanan dk, ilk kayıtlar), ‹ › ile hafta gezinme, sütuna dokunarak gün seçme; aylık görünüm korunur.
- İlk tekrar kaydı veri sürümü 6 / planlayıcı 2 / yedek biçimi 8 yapar. Tekrar içermeyen defterler 5/7 kalır; tekrar kaldırılırsa 5'e döner. v29 ve öncesi sürüm 6 verisini fail-closed reddeder.
- İki gerçek kusur kapatıldı: build betiği release.json'u hash'lerden sonra yazdığı için her sürüm bump'ında SW kurulumu bütünlük kontrolünde düşüyordu; plannerOccurrenceDone tekrar olmayanlarda gün özetini 0 gösteriyordu. Gün listesi saat/isim sıralı.
- 19 uygulama paketi 217 kontrol + güncelleme fixture'ları geçti. Canlı iki origin v30: releases/20260921-v30-repeat-week; rollback-before-v30 tutuldu. SHA256SUMS 4de1800d0bdbd671961fb3e1895560c423d0f05d0a3e5acaf8bcc9967a30d92f. Ayrıntı: outputs/BILGE_DEFTER_V30.md.
- Sıradaki iş: bildirim altyapısı / hesap-eşitleme önceliği kullanıcı kabulüne göre. Fiziksel tablet kabulü bekliyor.

## Önceki dilim: v29 — sürüm yayılımı ve tek tık güncelleme

- İşlev dilimi değil, kusur kapatma dilimi. Veri sürümü 5 / yedek biçimi 7 değişmedi.
- build-invited.cjs artık sw.js VERSION değişince index.html rozetini ve exportNotebook appVersion'ini otomatik eşitler; BOM'lu JSON'u okur, BOM üretmez. v28 yayınının rozet v27 kalma ve yanlış sürüm uyumsuzluğu mesajı kapatıldı (discovery #1842).
- offline-assets.json'daki BOM kaldırıldı; BOM'lu dosya SW kurulumunu "Release mismatch" ile sessizce bozardı.
- Güncellemeyi yükle tek başına çalışmıyordu (reload hep eski kabuğu açıyordu). sw.js yalnız açık onay mesajına (SKIP_WAITING) yanıt verir; pwa.js butonla bunu gönderir ve etkinleşince pencere yenilenir. Otomatik skipWaiting ve clients.claim yoktur.
- 198 yerel uygulama kontrolü (güvenli loopback + güvensiz LAN iki ayrı senaryo) ve güncelleme fixture'ları geçti. Tek tık güncelleme akışı ayrıca sınandı. Fiziksel tablet ve kullanıcının kurulu uygulama kabulü bekliyor.
- İki origin aynı 216 dosyalık pakete güncellendi: releases/20260921-v29-update-flow. Önceki konteynerler rollback-before-v29 olarak durduruldu. Nginx iki profile de private, no-store, no-transform oldu. SHA256SUMS bd007046fe934f4fb4c71f35729ec4044eeb85ef776b3504263b545b18383c02.
- Sıradaki dilim haftalık tekrarlanan dersler ve haftalık plan görünümü. Ayrıntı: outputs/BILGE_DEFTER_V29.md.

## Önceki dilim: v27 — takvim / elle çalışma planı, ilk dilim

- Araçlar → Çalışma Planı altında aylık takvim, tek seferlik ders/çalışma kaydı, saat/süre/not, defter bağlantısı, tamamlandı ve yeniden tarihleme eklendi.
- Silinen planlar yedeklenen arşive gider; geri getirme ve onaylı kalıcı silme var. İlk planla veri 5 / yedek 7 kullanılır. Eski yedek planları kaldırır; önizleme ve yükleme öncesi kurtarma bunu açıkça destekler.
- 200 yerel, özel canlı HTTPS'te 54 işlev ve davetli kapısında 16 kontrol geçti. Fiziksel tablet ve kurulu v27 kabulü kullanıcıdan bekleniyor.
- İki izole yayın 20260921-v27-planner; 213 dosyalık paket. Önceki v26 tutuldu ama takvimli veri v26 ile uyumlu değildir. Diğer servisler ve erişim ayarları değişmedi. Ayrıntı: outputs/BILGE_DEFTER_V27.md.
- Sıradaki dilim haftalık tekrarlanan dersler ve haftalık plan görünümü. Tekrarlama, bildirim, eşitleme ve AI henüz yok.

## Önceki dilim: v26 — ilk eklemede tek yerleşim akışı

- Yeni metin/görsel doğrudan sayfada seçili taslak olarak açılır. Metin, yazı boyutu, renk, genişlik, açı, sürükleme ve döndürme ilk yerleşimdedir; ayrıca Öğeyi düzenle seçmek gerekmez.
- Bitti tek ekleme/kayıt adımıdır; Vazgeç/Escape taslağı kaldırır. Tamamlanmamış taslak diske yazılmaz. Önceden kaydedilmiş nesneler için düzenleme korunur. v25 veri biçimi değişmedi.
- 180 yerel, özel canlı HTTPS'te 62 işlev ve davetli kapısında 15 kontrol geçti. Gerçek tablet ve kurulu v26 kabulü kullanıcıdan bekleniyor.
- İki izole yayın 20260921-v26-first-placement; v25 geri dönüş için tutuldu. Diğer servisler ve erişim ayarları değişmedi. Ayrıntı: outputs/BILGE_DEFTER_V26.md.
- Takvim/elle çalışma planı sonraki dilimdir; bu turda eklenmedi.

## Önceki dilim: v25 — metin ve görsel döndürme

- Kullanıcı v24 güncellemesinin tamamlandığını doğruladı. Önceki hata için bütün cihazları kapsayan bir kök neden kanıtlandığı iddia edilmiyor.
- Seçili nesneye serbest açı tutamacı, sola/sağa 90° ve açıyı sıfırlama eklendi. Taşıma/boyutlandırma, geri alma, yeniden açılış, JSON yedeği ve PDF çıktısı açıyla çalışır.
- İlk dönüşüm veri sürümü 4 / yedek biçimi 6 yapar. Eski veriler okunur; döndürülmüş yeni veri v24 ile açılamaz. Sunucu rollback'i yeni veriye uyumlu kabul edilmemeli.
- 167 yerel, özel canlı HTTPS'te 46 işlev ve davetli giriş kapısında 15 kontrol geçti. Gerçek tablet döndürme kabulü ve kullanıcının kurulu v25 geçişi ayrıca bekliyor.
- İki izole yayın 20260921-v25-rotation; önceki v24 tutuldu. Diğer servisler, Bilge Arena ve erişim ayarları değişmedi. Ayrıntı: outputs/BILGE_DEFTER_V25.md.
- Takvim/elle çalışma planı sonraki dilim; bu turda eklenmedi.

## Önceki dilim: v24 — sayfa üzerinde metin/görsel yerleşimi

- Kullanıcı isteğiyle takvimden önce yerleşim düzenleme yapıldı: Araçlar → Öğeyi düzenle, dokunarak seç, içinden taşı, köşedeki 44 px tutamaçla boyutlandır. Görsel oranı korunur; metin kutusu ve yazı birlikte ölçeklenir.
- Açık seçim modunda tek parmak/kalem/fare; normal çizimde avuç koruması değişmez. İkinci parmak dokunma dönüşümünü iptal eder; iki parmak kaydırmaya dönmek için Bitti kullanılır.
- Önizleme veriyi değiştirmez; bırakıldığında tek kayıt/geri alma adımı oluşur. İptal, kayıt hatası ve eski sekme çakışması sınandı. Şema değişmedi.
- 152 yerel, canlı HTTPS üzerinde 34 işlev ve public Access kapısında 15 kontrol geçti. Dar ekran ve PDF çıktısı görsel kontrol edildi. Fiziksel tablet ve kullanıcının kurulu v24 kabulü ayrıca bekliyor.
- İki yayın 20260921-v24-media-layout dizininde. v23 geri dönüş için tutuldu. Diğer servisler, Bilge Arena, DNS/Access/cache ve Tailscale değişmedi. Ayrıntılar outputs/BILGE_DEFTER_V24.md.
- Takvim/elle çalışma planı hâlâ sonraki dilimdir.

## Önceki dilim: v23 — notlu PDF dışa aktarma

- Kullanıcı v22 güncellemesinin düzeldiğini doğruladı. Tanılama 212 dosya / 0 sorun ve kurulu-bekleyen paket gösterdi; eski pencerelerin kapanmasından sonra güncelleme tamamlandı. HTML enjeksiyonu varsayımı doğrulanmadı.
- Araçlar içinde Notlu PDF indir eklendi: açık PDF sayfası veya bu defterdeki en fazla 50 PDF sayfası. Kalem/fosforlu/silgi/metin/görsel ayrı not katmanından zemine birleştirilir. Tamamen cihazda, çevrim dışı çalışır; kayıt ve yedek biçimi değişmez.
- Çıktı görüntü tabanlıdır; özgün vektör/baskı ölçüsü/aranabilir metin korunmaz. Normal sayfalar ve PDF dışındaki notlar dahil edilmez; arayüzde açıkça belirtilir. 64 MB çıktı sınırı, iptal ve hata koruması var.
- Yerelde 137; canlı Tailscale HTTPS üzerinde 29; public Access kapısında 15 kontrol geçti. PDF.js, pypdf strict ve Poppler ile çıktı doğrulandı. Fiziksel iPad indirme ve public kurulu uygulamanın v23 kabulü ayrıca bekliyor.
- Her iki yayın 20260920-v23-pdf-export dizininde. v22 geri dönüş için tutuldu; diğer servisler, Access/DNS/cache ve Tailscale değişmedi. Ayrıntılar outputs/BILGE_DEFTER_V23.md.
- Sıradaki dilim takvim ve elle çalışma planı; henüz eklenmedi.

## Önceki dilim: v22 — birleşik sürüm, hızlı geri al ve görünüm

- Sonraki kullanıcı bildirimi: kurulu public PWA v20'de kaldı. Zone-genel cache kuralının origin no-store başlığını 7200 saniyelik override ile geçersiz kıldığı bulundu. Yalnız defter.bilgearena.com için son cache=false kuralı eklendi ve 11 uygulama URL'si purge edildi. Diğer üç kural ve Access korunuyor. Kurulu istemcide gerçek güncelleme kabulü henüz kullanıcıdan bekleniyor; origin v22 tek başına public kullanıcı güncelleme kanıtı değildir.

- Tailscale v20 / davetli v21 yayın farkı canlı dosyalardan doğrulandı. Her iki ayrı servis aynı v22 paketine güncellendi; iki origin üzerindeki notlar birleştirilmedi veya taşınmadı.
- Hızlı Geri al silgi geçişinin üstünde; görünümde gruplu araçlar, sayfa başlığı, yüzer kompakt araçlar, beş dış çerçeve rengi ve özel renk seçici var. Tercih yalnız tarayıcıda saklanır, not verisi/yedeği değişmez.
- release.json ağ kontrolü, pencere/sunucu sürüm etiketleri ve açık sekmeleri zorlamayan güncelleme mesajları eklendi. Kontrollü gerçek v20 önbelleği → v22 geçişi notları korudu.
- 127 yerel, Tailscale HTTPS üzerinde 27 ve public Access kapısında 15 kontrol geçti. Mobil/tablet/yatay görünüm incelendi. Fiziksel cihaz kabulü ayrıca bekliyor. Diğer servis kimlikleri, DNS/Access ve Tailscale yönlendirmesi değişmedi.
- /opt/bilge-defter-test/releases/20260920-v22-ui ve /opt/bilge-defter-invited/releases/20260920-v22-ui aktif. Önceki konteynerler rollback-before-v22 adıyla durdurulmuş halde saklandı; v20 yeni metin/görsel biçimini okuyamadığından veri uyumlu geri alma sınırı korunmalı.
- Sıradaki dilim notlu PDF dışa aktarımı, ardından takvim/elle çalışma planı. Bu turda bu iki özellik eklenmedi. Ayrıntılı kanıt ve güncelleme yönergeleri outputs/BILGE_DEFTER_V22.md içinde.

## Önceki dilim: v20 — yüklenebilir PWA ve özel HTTPS

- Kullanıcı ağ genelindeki MagicDNS ve HTTPS sertifika ayarlarını açtı; sunucuda MagicDNSEnabled=true ve doğru CertDomains doğrulandı. DNS, Windows ve Linux üzerinden sertifika denetimli HTTPS 200 doğrulandı.
- Öncesinde Serve yapılandırması yoktu ve 8443 boştaydı. Yalnız `https://klipper-2.tail1ade8e.ts.net:8443/` → `http://127.0.0.1:18787` özel ağ yönlendirmesi eklendi. Funnel açılmadı, HTTP adresi korunuyor; diğer hizmetlerin ayarları değiştirilmedi. İlk curl bağlantı zaman aşımı sınırlı yeniden denemede düzeldi; normal sertifika denetimli curl ve Chromium HTTPS erişimi doğrulandı.
- PWA kurulum ekranı, simgeler, standalone manifest, 209 dosyanın bütünlük kontrollü önbelleği ve güncelleme yönergeleri hazırlandı. Yeni sürüm açık pencereleri zorla devralmaz; bütün eski pencereler kapanınca etkinleşir. Önceki cache yalnız başarılı etkinleşmede temizlenir, başka uygulama cache'leri korunur.
- Yerelde önceki 96 ve 8 PWA kontrolü geçti (104/104). Yayındaki HTTPS adresinde 96 regresyon ve 6 PWA kontrolü geçti (102/102). Bozuk / tam güncelleme ve çoklu sekme etkinleşmesi için 2 ek senaryo yalnız yerel denetimli sunucuda sınandı; canlı sunucuya bozuk dosya yüklenmedi. Ağ emülasyonu kapalıyken gerçek 14 sayfalık PDF içe aktarma, not, yakınlaştırma, yeniden açılış ve JSON yedek sınandı. Güncelleme hata mesajı kontrollü hata enjeksiyonuyla sınandı. Fiziksel cihaz kurulumu değildir.
- v20 /opt/bilge-defter-test/releases/20260920-215523 altında yayımlandı. Tüm SHA256 manifesti doğrulandı; v19 geri dönüş için tutuldu, diğer çalışan konteyner kimlikleri değişmedi. Kurulum ekranı 390 px görünümde incelendi. HTTPS / ana ekran depolaması otomatik veri göçü değildir; kullanıcı JSON yedeğini hedefte açık onayla yüklemeli. Kullanıcının gerçek notlarına dokunulmadı.
- Fiziksel iPad/Android ana ekran kurulumu, kalem kabulü ve uzun kullanım performansı bekliyor. Basınca duyarlı fırça, Apple'a özel hareketler, PDF dışa aktarma, eşitleme/AI ve Bilge Arena bu dilimde yapılmadı.

## Önceki dilim: v19 — PDF yakınlaştırma

- PDF için %100–%300 düğmeli yakınlaştırma, genişliğe sığdır ve iki parmakla yatay/dikey gezinme eklendi. Yakınlaştırma ve konum sayfa bazında kayda/yedeğe dahildir; eski PDF'ler zorunlu kayıt göçü olmadan %100 açılır.
- PDF, kalem ve silgi aynı dönüşümü kullanır; belge koordinatları değişmez. Tuval yalnız görünür ekran kadar tutulur. Etkin çizgi sırasında yakınlaştırma engellenir; normal sayfaların sınırsız dikey alanı korunur.
- Yerelde 96/96 kontrol grubu geçti: önceki 88 kontrol ve 8 yeni yakınlaştırma kontrolü. Gerçek tarayıcı iki parmak olayları, bilinen PDF pikseliyle mürekkep/silgi hizası, yeniden açılış, yedek, yön değişimi, Çöp Kutusu, kayıt hatası, eski sekme, geçersiz görünüm ve dar ekran sınandı. Sayfa okları 44 px dokunma hedeflerine çıkarıldı.
- Klipper test yayını /opt/bilge-defter-test/releases/20260920-211257 üzerinde tamamlandı; http://100.84.251.49:18788/?v=19. Yayında da aynı 96/96 kontrol grubu geçti. Tüm dosya özetleri doğrulandı, v18 geri dönüş için tutuldu ve diğer çalışan konteyner kimlikleri değişmedi. Kullanıcı notlarından ayrı tarayıcı profilleri kullanıldı.
- Fiziksel tablet/Safari kabulü bekliyor. Saklanan görüntü 1000 px olduğundan büyütme keskinliği artmaz; özgün PDF saklama, notlu PDF dışa aktarma ve uzun ders performansı açık işlerdir. Hesap/eşitleme/AI, HTTPS ve Bilge Arena bu dilimde kapsam dışıdır.

## Önceki dilim: v18 — PDF sınırlarını artırma

- Kullanıcı isteğiyle dosya sınırı 10 MB'dan 20 MB'a, sayfa sınırı 20'den 50'ye çıkarıldı. Bayt sınırı 20 × 1024 × 1024; arayüz, hata mesajı ve kayıt doğrulaması birlikte güncellendi.
- Görüntü çözünürlüğü, tek sayfa/toplam görüntü sınırı ve işlem zaman aşımı aynı kaldı. Yoğun taranmış PDF'lerde bu korumalar devreye girebilir; 20 MB tüm tabletlerde hızlı çalışır garantisi yoktur.
- Tam 20 MiB dolgu içeren gerçek PDF kabul edildi; 20 MiB + 1 bayt reddedildi. Gerçek 50 sayfalık hafif PDF eklendi, son sayfa notu yeniden açılış ve JSON yedekten dönüşte korundu. 51 sayfa reddedildi. 13 PDF + 24 genel kontrol yerelde ve yayında geçti (37/37); tüm diğer özel test paketleri bu küçük değişiklikte tekrar çalıştırılmadı. Fiziksel tablet performansı ve yoğun taranmış PDF kabulü ayrı kaldı.
- v18 yayını /opt/bilge-defter-test/releases/20260920-205953; http://100.84.251.49:18788/?v=18. Tüm dosya özetleri doğrulandı; v17 geri dönüş için saklandı ve diğer çalışan konteyner kimlikleri değişmedi. v17, yeni 20 üzeri PDF sayfa kayıtlarını açamaz; eski açık sekmeler yenilenmelidir.

## Önceki dilim: v17 — PDF üzerine not, ilk dilim

- PDF cihazda PDF.js 6.3.289 ile görüntüye dönüştürülür; yeni deftere, ayrı sayfalar halinde eklenir. Sınırlar 10 MB / 20 sayfa / 1000 px genişliktir. Özgün dosya saklanmaz; kullanıcı orijinal PDF'yi korumalıdır.
- Sayfa okları, kalem/fosforlu/silgi, iki parmak kaydırma ve yeniden açılış çalışır. Mürekkep bağımsızdır; silgi/temizleme PDF zeminini değiştirmez. Ölçekli belge koordinatları ekran yönü değişiminde hizayı korur.
- Hazırlık/iptal notları değiştirmez. Açık ekleme tek yerel işlemle yapılır; kayıt hatası ve eski sekme çakışmasında önceki notlar korunur. Yükleme öncesi geri dönüş kopyası tutulur.
- Kayıt şeması 2 ve yedek biçimi 4 eski uygulamanın PDF'yi yanlış açmasını engeller. Görüntüler ve notlar JSON yedeğinde, kopyalama ve Çöp Kutusunda korunur. Bozuk PNG ve güvenli olmayan görüntü verisi yükleme öncesinde reddedilir.
- Gerçek 14 sayfalık resmi PDF.js örneğiyle 11 PDF + önceki 75 kontrol grubu yerelde ve Klipper test yayınında ayrı ayrı geçti (86/86). Bozuk/çok büyük PDF, kayıt iptali ve yeniden deneme, kalem/fosforlu/silgi, zemin piksel koruması, yeniden açılış, yön değişimi, kaydırma, biçim 4 yedek, Çöp Kutusu, bozuk PNG, hazırlık iptali, eski sekme çakışması ve dar ekran sınandı. Testler gerçek kullanıcı verisinden ayrı profillerdeydi.
- Yayın /opt/bilge-defter-test/releases/20260920-204351; adres http://100.84.251.49:18788/?v=17. Tüm dosyaların SHA256 manifesti doğrulandı. v16 geri dönüş için tutuldu; diğer çalışan konteyner kimlikleri değişmedi. v16 yeni PDF kayıt şemasını açmaz; bu geri dönüş veri dönüştürme değildir.
- Açık kalan PDF işleri: özgün PDF/vectör saklama mimarisi, yakınlaştırma, notlu PDF dışa aktarma, daha büyük belgeler ve uzun ders performansı. Fiziksel tablet/Safari kabulü bekliyor. Takvim, elle çalışma planı, HTTPS/çevrim dışı, hesap/eşitleme/AI ve canlı Bilge Arena bu dilimde yapılmadı.

## Önceki dilim: v16 — temizleme öncesi kurtarma

- Sayfayı temizle artık mevcut sayfanın bağımsız kopyasını Çöp Kutusuna alır. Boş sayfada ve iptalde değişiklik yoktur. Kopya ve temizleme aynı yerel kayıt işlemindedir.
- Kopya yeni kimlikle, temizleme öncesi adıyla saklanır; çizim/silgi izleri, renk, defter ve kaydırma konumu korunur. Geri getir ayrı sayfa açar, özgün sayfaya sonradan yazılanları ezmez. Geri al kısa yolu kopyadan bağımsızdır.
- Her temizleme ayrı kopya tutar; otomatik silinmez. Çöp Kutusu aynı tarayıcıdadır, bağımsız yedek değildir; kopyalar biçim 3 JSON yedeğine dahildir. Kayıt hatası eski disk verisini korur; acil yedek ve tekrar deneme kullanılabilir.
- Yerelde önceki 68 + 7 temizleme kurtarma kontrolü geçti (75/75). Yeniden açılış, bağımsız kopya, tekrarlanan temizleme, gerçek dosya yedeği, kayıt hatası, eski sekme ve 390 px dokunmatik arayüz sınandı.
- Klipper v16 yayını /opt/bilge-defter-test/releases/20260920-203042 üzerinde tamamlandı; yayın sonrası aynı 75/75 kontrol grubu geçti. Adres http://100.84.251.49:18788/?v=16. Sunulan dosya içeriği doğrulandı; v15 geri dönüş için tutuldu, diğer çalışan konteyner kimlikleri değişmedi. Testler ayrı tarayıcı profillerindeydi; kullanıcı notlarına dokunulmadı.
- Fiziksel tablet kabulü, HTTPS/çevrim dışı, PDF, hesap/eşitleme/AI ve canlı Bilge Arena bu dilimde yapılmadı. Güncellemeden önce kayıt tamamlanmalı, bağımsız JSON yedeği alınmalı ve eski sekmeler yenilenmelidir.

## Önceki dilim: v15 — kurtarılabilir sayfa silme

- Sayfayı sil artık Çöp Kutusuna taşır; Sayfalar panelinde sayı ve kurtarma penceresi vardır. Kimlik, çizim, renk ve kaydırma konumu korunur; eski defter yoksa Genel'e geri getirilir. Kalıcı sil ayrı onay ister, otomatik temizlik yoktur.
- Çöp Kutusu yerel kayda ve biçim 3 JSON yedeğine dahildir. Eski yedekler okunur. Yedek yükleme defterleri ve Çöp Kutusunu birlikte değiştirir; yükleme öncesi kurtarma kopyası ikisini de içerir.
- Sayfayı temizle bu dilime dahil değildir; açık oturumdaki geri alma sınırı sürer. Çöp Kutusu bağımsız yedek değildir. Güncelleme öncesi kayıt tamamlanmalı, JSON yedeği alınmalı ve eski açık sekmeler kapatılmalıdır.
- Yerelde 24 genel + 7 kayıt + 5 kaydırma + 8 yedek + 8 defter + 7 renk/silgi + 9 Çöp Kutusu kontrol grubu geçti (68/68). Kalıcı silme, yeniden açılış, eski/yeni yedek, eksik defter, geçersiz veri, dar ekran, kayıt hatası ve eski sekme çakışması sınandı.
- Klipper v15 yayını /opt/bilge-defter-test/releases/20260920-201121 üzerinde tamamlandı; yayın sonrası aynı 68/68 kontrol grubu geçti. Adres http://100.84.251.49:18788/?v=15. Dosya özeti doğrulandı; v14 geri dönüş için tutuldu ve diğer çalışan konteyner kimlikleri değişmedi. Başlangıçtaki kısa bağlantı kesilmesi sınırlı yeniden denemede düzeldi.
- Fiziksel tablet kabulü, HTTPS/çevrim dışı, hesap/eşitleme/AI ve Bilge Arena entegrasyonu bu dilimde yapılmadı. Testler ayrı geçici tarayıcı profillerinde çalıştı; gerçek kullanıcı notları değiştirilmedi.

## Önceki dilim: v14 — sayfa rengi ve hızlı silgi boyutu

- Araçlar içine altı zemin rengi ve özel renk seçimi eklendi. Yalnız açık sayfa etkilenir; çizgi renkleri/koordinatları değişmez. Koyu zeminlerde kılavuz çizgisi kontrastı ayarlanır; eski sayfalar krem kalır.
- Renk sayfa bazında kaydedilir; kopya, başka deftere taşıma, yeniden açılış ve JSON yedeğinde korunur. Boş defterde renk seçilemez; geçersiz renkli yedek notların yerini alamaz.
- Silgiye hızlı geçince kenarda Boyut düğmesi görünür. 8/16/32/64 px seçim, 1–64 px sürgü ve gerçek CSS çapı önizlemesi vardır. Araçlar kalınlığıyla eşzamanlıdır; kalem/fosforlu kalınlıkları bağımsızdır.
- Silgi ayarı açık oturumda hatırlanır; çizimdeki silme genişliği kalıcı kayda dahildir. Aktif çizgi sırasında renk/hızlı boyut değişimi engellenir. Zemin silinmez.
- Yerel ve Klipper test yayını ayrı ayrı 24 genel + 7 kayıt + 5 kaydırma + 8 yedek + 8 defter + 7 renk/silgi kontrolünü geçti (59/59). 8 ve 64 px silginin farklı miktarda gerçek tuval pikseli sildiği, renkli sayfada silme, 320 px renk hedefleri, dikey/yatay hızlı ayar, yedekten dönüş ve kayıt hatası kurtarması sınandı. Fiziksel tablet kabulü bekliyor.
- Güncel yayın: /opt/bilge-defter-test/releases/20260920-195129; http://100.84.251.49:18788/?v=14. v13 geri dönüş için saklandı, diğer çalışan konteyner kimlikleri değişmedi. Başlangıç kontrolündeki geçici bağlantı kesilmesi sınırlı yeniden denemede düzeldi; son dosya özeti doğrulandı.
- Hesap/eşitleme/AI eklenmedi. HTTPS ve çevrim dışı kabul sınırları değişmedi.

## Önceki dilim: v13 — defter / ders gruplama

- Sayfalar paneline defter seçimi, oluşturma ve adlandırma eklendi. Eski sayfalar veritabanına zorunlu göç yazısı yapılmadan Genel altında görünür; kimlikleri, çizimleri ve kaydırma konumları korunur.
- Yeni defter boş olabilir; boş görünüm ve seçili defter yeniden açılışta korunur. Yeni sayfa seçili deftere eklenir. Sayfa menüsünden başka deftere taşıma, defter içinde sıralama ve aynı defterde bağımsız kopya desteklenir.
- Genel kalıcıdır; diğer defterler yalnız boşken onayla silinir. Dolu defterin ve uygulamadaki son sayfanın silinmesi engellenir.
- Yedekler tüm defterleri kapsar. Gruplu yedek biçimi 2 kullanır, eski biçim 1/düz JSON okunur. v12 biçim 2'yi reddeder. Eski sürümlerde gruplu veri dışa aktarılmamalı; açık sekmeler v13'e yenilenmelidir.
- Eski düz yedek geri yüklenirse mevcut bütün gruplar onunla değiştirilir, sayfalar Genel'e döner. Önizleme ve yükleme öncesi kurtarma kopyası bu kapsamı korur.
- Yerel ve Klipper yayını ayrı ayrı 24 genel + 7 kayıt + 5 kaydırma + 8 yedek + 8 defter kontrolünü geçti (52/52). Gerçek Chromium dokunma, dosya seçici, grup/boş defter yeniden açılışı, kayıt hatası/sekme çakışması, gruplu yedekten dönüş ve 390 px ekran sınandı. Fiziksel tablet kabulü hâlâ bekliyor.
- Geliştirme testinde boş defterin Yeni sayfa düğmesinin çizim alanı touch engellemesine takılması bulundu; düğme çizim yüzeyi dışına taşındı ve gerçek tarayıcı dokunmasıyla doğrulandı. Hatalı taslak yayımlanmadı.
- v13 yayını: /opt/bilge-defter-test/releases/20260920-193154; http://100.84.251.49:18788/?v=13. Bu sürümün yayınında v12 geri dönüş için saklandı; diğer çalışan konteyner kimlikleri değişmedi. HTTP/HTTPS ve çevrim dışı kabul sınırları aynıdır; hesap, eşitleme ve AI eklenmedi.

## Önceki dilim: v12 — sürümlü yedek ve yükleme önizlemesi

- JSON dışa aktarımına ayrı yedek biçimi/sürümü ve uygulama sürümü eklendi; tarih/saatli dosya adları kullanılır. Eski düz belge yapısı okunmaya devam eder; yeni dosyalar da üst düzey sayfa alanını korur.
- Yüklemeden önce tarih, gerçek sayfa/çizgi sayısı, ilk 20 sayfa adı ve mevcut defterin değişeceği uyarısı gösterilir. Önizleme notları değiştirmez; açık yükleme düğmesi gereklidir. Vazgeç/Kapat/Escape güvenlidir.
- Önizleme içinden mevcut defterin bağımsız JSON dosyası indirilebilir. İndirme başlatıldı bilgisi, dosyanın cihazda kalıcı saklandığı iddiası değildir.
- Geçersiz ve desteklenmeyen biçimler kayıtları değiştirmeden reddedilir. Önizleme sırasında başka sekme kayıt yaptıysa eski sekme onun üzerine yazamaz. Başarısız yükleme sonrası acil yedek ve yeniden deneme kullanılabilir.
- Yerelde ve Klipper yayını üzerinde 24 genel + 7 kayıt + 5 kaydırma + 8 yedek önizleme kontrol grubu ayrı ayrı geçti (44/44). Gerçek dosya seçici, eski/yeni yedek geri dönüşü, iptal, hata, sekme çakışması, dar/dikey ve kısa/yatay ekran sınandı. Fiziksel tablet kabulü henüz yapılmadı.
- v12 yayını: /opt/bilge-defter-test/releases/20260920-185430; http://100.84.251.49:18788/?v=12. Bu sürümün yayınında v11 geri dönüş için saklandı; diğer çalışan konteyner kimlikleri değişmedi. Kullanıcının tarayıcı notlarına test verisi yazılmadı.
- Bu dilimin ardından v13 defter/ders gruplama tamamlandı; HTTPS/çevrim dışı kabulü ve fiziksel tablet kabulü ayrıca açıktır. Sunucu eşitlemesi, AI ve canlı Bilge Arena değişikliği yoktur.

## Önceki dilim: v11 — iki parmakla kaydırma ve aşağı doğru sınırsız alan

- İki parmakla yukarı/aşağı kaydırılır; üst sınır başlangıçtır, aşağı doğru sabit sayfa sonu yoktur. Çizim yüzeyi ekran boyutunda kalır, not koordinatları belge alanında tutulur.
- Kaydırma iz bırakmaz; dokunmayla yazma açıkken ilk parmağın geçici çizgisi ikinci parmak geldiğinde kaldırılır. Bir parmak kalkınca kalan parmak yanlışlıkla yazmaya başlamaz.
- Etkin kalem çizgisi sırasında avuç temasları kaydırmayı başlatamaz. Avuç içi koruması açıkken de bilinçli iki parmak kaydırması kullanılabilir.
- Sayfa başına kaydırma konumu kaydedilir ve JSON yedeğinde korunur. Araçlar penceresinde Sayfanın başına dön düğmesi vardır. Önceki not koordinatları değişmez.
- Yerelde ve Klipper test yayınında ayrı ayrı 24 genel + 7 kayıt + 5 kaydırma kontrol grubu geçti (36/36). Chromium gerçek iki parmak olay akışı, 100000 px ötesinde yazı/kayıt/yeniden açılış ve yedekten dönüş sınandı. Fiziksel iPad/Android kabulü henüz yapılmadı.
- v11 yayını: /opt/bilge-defter-test/releases/20260920-184600; http://100.84.251.49:18788/?v=11. Bu sürümün yayınında v10 geri dönüş için saklandı; diğer çalışan konteyner kimlikleri değişmedi.
- İlk yayın denemesi başlangıçtaki bağlantı kesilmesinde otomatik v10'a geri döndü. Eski sürümün çalıştığı ve içeriği doğrulandı; başlangıç kontrolüne sınırlı yeniden deneme eklenerek ikinci yayın başarılı oldu.

## Önceki dilim: v10 — kayıt/kesinti güvenliği

- v9'da iki hata testte yeniden üretildi: eski açık sekmenin başka sekmenin çizgisini ezmesi ve başarısız yedek yüklemenin ekrandaki defteri yine de değiştirmesi.
- Biten çizgi/sayfa işlemleri hemen tek bir kayıt kuyruğuna alınır; yalnız en son değişiklik tamamlandığında başarı gösterilir. Uzun çizgilerde 500 ms aralıklı ara kayıt vardır.
- Veritabanındaki beklenen içerik aynı işlem içinde karşılaştırılır; çakışmada bu sekmenin düzenlemesi durur, yerel değişiklikleri dışa aktarılabilir. Eski uygulama sürümündeki açık sekmeler ayrıca kapatılıp yenilenmelidir.
- Kayıt hatasında görünür uyarı, yeniden deneme ve acil JSON yedek vardır. Yedek yükleme önce mevcut kayıt kuyruğunu bitirir; yeni defter ve yükleme öncesi tek geri dönüş kopyası aynı işlemde kaydedilir. İşlem başarısızsa ekran ve eski kayıt korunur.
- Önceki defter Araçlar içinden geri getirilebilir; bu kopya aynı tarayıcıda tutulur ve bağımsız yedek değildir.
- Yerelde ve Klipper'da 24 genel + 7 özel kayıt güvenliği kontrolü geçti. Fiziksel tablet, işletim sistemi zorla kapatma ve ani güç kesilmesi doğrulanmadı; sıfır kayıp garantisi yoktur.
- v10 yayını: /opt/bilge-defter-test/releases/20260920-183420; http://100.84.251.49:18788/?v=10. Bu sürümün yayınında diğer konteyner kimlikleri değişmedi; v9 geri dönüş için saklandı.

## Önceki dilim: v9

- İstenen hızlı kalem/silgi geçiş düğmesi.
- Planın 4. aşamasına başlangıç: sayfa adlandırma, bağımsız kopya ve sıralama.
- Eski yerel veriler ve yedek biçimi korunur. Kalınlıklar araç başına yalnız açık oturumda hatırlanır.
- Yerel ve Klipper tarayıcı testleri çalıştırılmadan tamamlandı sayılmaz; fiziksel tablet kabul testi ayrıdır.

## v21 — metin ve görsel — 20 Eylül 2026

- Kullanıcı davetli girişin çalıştığını doğruladı. Aynı davetli adrese yerel metin/görsel ekleme, düzenleme, konum/genişlik, silme ve klavye kısayolları eklendi. Yeni içerik state v3 / backup v5; eski veriler açılır, eski uygulamalar yeni yedeği reddeder.
- Yerel 117 kontrol (96 regresyon, 13 medya, 8 PWA) geçti. Sunucudan sunulan v21 ayrıca 13 medya kontrolünü geçti. Yeni script dahil davetli kapısı doğrulandı. Fiziksel tablet/ekran klavyesi kabulü bekliyor.
- Yayın /opt/bilge-defter-invited/releases/20260920-v21-media. Önceki davetli v20 saklandı, özel Tailscale v20 ve diğer servisler değişmedi. Yeni veri oluşturulduğunda eski v20'ye sunucu geri dönüşü veriyi okunabilir yapmaz; v21 uyumlu düzeltme ve yedek gerekir.
- Konum seçimi sırasında gecikmiş dialog close olayının taslağı temizlemesi testte bulundu ve düzeltildi. Bozuk görsel, başarısız kayıt/retry, yerel PDF ve çevrim dışı yedek dönüşü test edildi.

## Davetli bağlantı — 20 Eylül 2026

- https://defter.bilgearena.com iki kullanıcı e-postasına sınırlı Cloudflare Access PIN girişiyle yayımlandı. Ayrı Tunnel ve iki ayrı konteyner kullanılıyor. Eski Tailscale yayını ve diğer servisler korundu.
- Davetli paket 8 yerel PWA testini; canlı giriş kapısı 11 erişim/tarayıcı kontrolünü geçti. Gerçek e-posta kodu teslimi, izinli girişin tamamlanması ve yeni adreste fiziksel PWA kurulumu kullanıcı kabulü bekliyor.
- Notlar hâlâ yereldir; hesap bazlı eşitleme yoktur. Eski adresten yeni adrese JSON yedekle kontrollü aktarım gerekir. Önceden önbelleğe alınmış uygulama/notlar davet iptaliyle uzaktan silinmez.
- İşletim kimlikleri, sınırlar ve uygulanmamış geri alma yönergesi outputs/BILGE_DEFTER_DAVETLI_YAYIN.md dosyasında.

## Devam sırası

1. Kalem/kayıt kabulü: kullanıcı iPad'de çizimin çalıştığını doğruladı; v11 iki parmak kaydırma ve kayıt kurtarma fiziksel tablet testi, Android ve uzun ders kullanımı henüz doğrulanmadı.
2. Sağlam defter: kayıt sırasında kapanma/kesinti, hata kurtarma, sürümlü yedek ve sayfa/defter organizasyonu. Bu ilk sayfa yönetimi dilimi tüm aşamayı tamamlamaz.
3. Güvenli çevrim dışı açılış ve güncelleme: mevcut HTTP adresinde service worker etkin değil. HTTPS/adres değişikliği yerel notları başka origin'e taşımaz; önce yedek ve kontrollü aktarım gerekir. Genel Tailscale/DNS ayarları izinsiz değiştirilmez.
4. PDF üzerine not, takvim ve elle çalışma planı.
5. Hesap, kullanıcıya özel erişim, eşitleme ve bağımsız yedekleme.
6. Türkçe/tıbbi sözlük, el yazısı tanıma ve kaynaklı AI.
7. Gerçek pilot ve Bilge Arena'ya kontrollü entegrasyon.

Canlı Bilge Arena, başka servisler, yeni AI altyapısı ve VPS bu değişiklik diliminin dışındadır.

## Doğrulama — 20 Eylül 2026

- v9 yerelde ve Klipper test adresinde ayrı ayrı 24 Chromium kontrol grubunu geçti.
- Gerçek tarayıcı çizimi/silmesi, hızlı geçiş, bağımsız sayfa kopyaları, sıralama/adlandırma sonrası yeniden açılış ve gerçek dosya seçiciyle JSON yedekten dönüş sınandı. Sentetik kalem ve avuç olayları fiziksel tablet kabulü yerine geçmez.
- Yayın: /opt/bilge-defter-test/releases/20260920-182009; adres http://100.84.251.49:18788/?v=9.
- Önceki v8 sürümü geri dönüş için tutuldu; diğer çalışan konteyner kimlikleri değişmedi. Gerçek kullanıcı notlarına test verisi yazılmadı.
