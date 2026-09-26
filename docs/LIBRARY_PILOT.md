# Bilge Defter — anatomi/fizyoloji kaynak kütüphanesi pilotu

## v56 birlikte yayın — tamamlandı (25 Eylül 2026)

- Kullanıcının açık yayın onayıyla ana uygulama v56 ve kütüphane alıntı aktarımı birlikte yayımlandı. Adres: `https://defter.bilgearena.com/`. Kurulu uygulamada güncellemeyi denetleyip v56'ya geçin; hazır sürüm bekliyorsa kayıt tamamlandıktan sonra tüm Bilge Defter pencerelerini kapatıp yeniden açın. Tarayıcı verilerini silmeyin.
- Kullanım: **Kütüphane → Kitabı aç → Metin olarak oku → Seçili metni deftere al / Bu sayfanın metnini deftere al → hedef sayfa → Sayfada yerleştir → Bitti**. Bu akış henüz gerçek iPad ve gerçek kullanıcı hesabıyla kabul edilmiş sayılmaz.
- Önce mevcut v55 ve kütüphane dosyalarının özetleri doğrulandı. Ayrı web ve kütüphane önizlemesi, ayrı geçici kayıt alanı ve yalnız localhost 18800/18801 portları kullanıldı. Klipper üzerinde 22 metin/hesap testi ve 8 gerçek yetkisiz/sahte oturum reddi geçti. Kaynak PDF bütünlüğü testlerde doğrulandı.
- Canlıda **237/237 HTTP dosya özeti, 234 çevrimdışı varlık, 5 yetkisiz istek, 1 sahte oturum ve 5 özel yol engeli** doğrulandı. Kütüphanede dört güncel dosya özeti ve 8 erişim reddi ayrıca kontrol edildi. Dışarıdan temiz uygulama/kütüphane/okuyucu istekleri Access girişine 302 döndü; bu, kimliği doğrulanmış kullanıcı kabulü değildir.
- Yalnız davetli web konteyneri değiştirildi ve kütüphane kodu güncellenip aynı konteyner yeniden başlatıldı. Hesap servisi/veritabanı, yer imi alanı, kaynak PDF'ler, Access/DNS, Bilge Arena ve diğer servisler korunmuştur; diğer konteyner kimlikleri/başlangıç durumları ve ana servis PID'si eşleşti. İki önizleme konteyneri durduruldu.
- Geri dönüş: `python3 /opt/bilge-defter-classroom-v56/deploy-library-v56.py rollback`. v55 konteyneri `bilge-defter-invited-web-rollback-v56`, eski kütüphane kodu `/opt/bilge-defter-classroom-v56/library-backup` içinde korunur. Yeni quote.js geri dönüşte kullanılmaz ve kanıt olarak kalır. Eski v55/text-v1 betikleri doğrudan çalıştırılmamalıdır.
- Mevcut izleme kusuru: kütüphanede yeniden kullanılan PDF imajının sağlık kontrolü `/api/v1/info/status` sorguladığından Docker sağlıksız gösterebiliyor. Gerçek kütüphane HTTP/izin testleri geçti. Bu yayında mevcut konteyner korundu; yanlış sağlık kontrolü değiştirilmedi, merkezi bug #1875 olarak kaydedildi. Önizlemede yanlış miras kontrolü devre dışı bırakılıp gerçek testler uygulandı.
- Kanıt: `outputs/library-quote-release/live-proof.json`, `preview-proof.json`; uzak `/opt/bilge-defter-classroom-v56/`. Paket SHA256 `1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e`. Git commit/push/merge ve ücretli servis çağrısı yapılmadı.

## Deftere alıntı aktarma — yayın öncesi aday kaydı (25 Eylül 2026)

- Metin görünümünde **Seçili metni deftere al** ve **Bu sayfanın metnini deftere al** eklendi. Seçim yalnız kaynak metni içinden alınır; sayfa başlığı/menüler dışlanır. Sayfa aktarımı yalnız metindir; resimler, tabloların görsel düzeni ve PDF sayfa görüntüsü taşınmaz.
- Ekranda görünen metin alınır: tarayıcı çevirisi kullanıldıysa çevrilmiş metin olabilir. Kaynak adı, yazar, lisans ve lisans bağlantısı, yayıncı bağlantısı, PDF sıra numarası, basılı sayfa etiketi ve özgün kaynakla karşılaştırma uyarısı alıntıya eklenir. Kaynak PDF'ler değiştirilmez.
- Aynı tarayıcı/origin ve aynı onaylı hesap gerekir. Metin yalnız cihazda, rastgele kimlikli geçici aktarımda tutulur; URL'ye veya sunucuya gönderilmez. 10 dakika sonra kabul edilmez; sonraki aktarım süresi geçmiş kayıtları temizler. İptal/yerleştirme aktarım kaydını tüketir. En çok 10 bekleyen aktarım; kaynak dahil 10.000 karakter sınırı vardır. Uzun sayfa sessizce kesilmez, bölüm seçmesi istenir.
- Defterde alıntı önizlemesi ve hedef defter/sayfa seçimi açılır. **Sayfada yerleştir** mevcut metin aracının ilk yerleşimini başlatır; taşıma/boyut/yazı ayarı yapılabilir. **Bitti** metni normal kayıt ve yedekleme akışına ekler; **Vazgeç** not eklemez. Mevcut notlar değiştirilmez veya üzerlerine yazılmaz.
- Hesap açılışta ve yerleştirmeden önce yeniden doğrulanır. Farklı hesap, süresi geçmiş/bozuk/büyük paket, daha önce tüketilmiş aktarım, açık düzenleme, depolama hatası ve kayıt çatışması güvenli şekilde reddedilir. Sekmeler arası tüketim Web Locks ile sıralanır; destek yoksa aktarım yapılmaz. Aynı sekmedeki giriş dönüşünde yalnız aktarım kimliği korunur, kullanıcı hesabının doğrulanması atlanmaz.
- **37 Python testi, 28 alıntı tarayıcı kontrolü, 8 metin okuyucu kontrolü, 14 giriş/PWA kontrolü ve 6 gerçek service-worker güncelleme kontrolü geçti.** Chrome/WebKit 390 ve 820 genişlikleri; hesap yanıtları sentetik. Gerçek Access e-posta turu, gerçek tarayıcı çevirisi ve fiziksel iPad kalemle seçim kabulü henüz yoktur. Telefon alıntı penceresi ve okuyucu düzeni görsel incelendi.
- Aday `work/bilge-defter-invited-v56`; yapım `node work/prepare-library-quote.cjs`. Doğrulanmış v55 temelinden yalnız media-workspace ve sürüm/paket dosyaları değişti: 237 dosyanın 232'si aynı, 234 çevrimdışı varlık. Karma geliştirme ağacındaki yayımlanmamış PDF çalışmaları dahil değil. Paket SHA256: `1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e`.
- Kanıt `outputs/library-quote/`; ana aktarım testi `work/verify-library-quote.cjs`. Giriş testinin tarihi v51 adı korunur ama BILGE_TEST_ROOT ile v56 üzerinde çalıştırıldı; güncelleme testi aynı senaryolarla v55/v56 olarak çalıştırıldı. İlk test hazırlığında fazla parantez, kayıt tetikleme eksikliği, salt fragment gezinmesi ve boş sekmede test localStorage erişimi düzeltildi; başarısız denemeler kabul sayılmadı.
- **Canlı uygulama/kütüphane değiştirilmedi, Git commit/push/merge yok.** Yerel 8766 okuyucu yenilendi; tek başına bu yerel kütüphane deftere bağlı olmadığını açıklar. Yayın için v56 ana uygulama ve yeni kütüphane dosyaları birlikte, ayrı mevcut-durum/geri-alma denetimiyle ele alınmalıdır. Kullanıcının kurulu uygulaması v56'ya geçmeden aktarım kabulü yapılamaz. Önceki deploy betikleri yeni dosya özetleriyle körlemesine çalıştırılmamalıdır.

Durum: **25 Eylül 2026 — v55 uygulama içi kütüphane bağlantıları yayımlandı.**
Bağlantı: <https://defter.bilgearena.com/library/>. Dilara mevcut onaylı Bilge Defter hesabıyla dener.
Üst menüde Kütüphane ve sözlükte Kütüphanede ara bulunur. Kitap okuyucu yeni sekmede açılır; defter açık kalır. İlk ayrı bağlantı yayını v54 idi; aşağıdaki bölüm o yayının kanıtını korur.
Kontrol tarihi: 25 Eylül 2026. Dal: `feat/klipper-pdf-backup`, başlangıç HEAD: `5f1f83f`.

## Tarayıcı çevirisine uygun metin okuma — 25 Eylül 2026

- **Yayında:** Kütüphane → bir PDF sayfası → **Metin olarak oku**. Ayrı sekmede normal İngilizce HTML metin açılır. Kullanıcı tarayıcı menüsünden çeviriyi kendisi seçer. Bilge Defter çeviri API'si çağırmaz ve metni otomatik dış servise göndermez.
- Başlık, yazar/yayıncı, lisans, PDF sıra numarası ve varsa basılı sayfa etiketi korunur. Önceki/sonraki sayfa bağlantıları ve aynı sayfaya dönen **Özgün PDF görünümü** vardır. Boş metinli sayfa açıkça bildirilir; yeni OCR işlemi yapılmaz.
- Metin mevcut doğrulanmış sayfa dizininden alınır, HTML olarak kaçışlanır. Özgün PDF değiştirilmedi. Resimler gösterilmez; formül, sütun, tablo ve okuma sırası çıkarımda bozulabilir. Görsel doğrulama için PDF esastır.
- Çeviri/gizlilik açıklaması görünüm içinde bulunur: tarayıcı çeviri sağlayıcısına içerik gönderebilir; tıbbi terim hataları olabilir. Akademik doğruluk veya cihazların hepsinde Türkçe çeviri garantisi verilmez.
- `/library/read/<kaynak>/<sayfa>?account=<id>` mevcut onaylı oturumu ve hesap eşleşmesini her istekte doğrular; sayfa numarası ve kaynak kimliği sınırlandırılır. Script çalıştıran okuyucu yoktur; kaynak metni HTML olarak yorumlanmaz.
- **36 Python testi ve 30 tarayıcı kontrolü geçti.** Bunların 8'i yeni metin/API testleri, 8'i gerçek metin görünümü Chromium/WebKit telefon/tablet kontrolleridir. 21 metin/hesap testi Klipper izole önizlemesinde de geçti. İnternetten temiz istek mevcut Access girişine yönlendi; origin oturumsuz/sahte oturumlu 6 isteği reddetti.
- Yalnız kütüphanede `server.py`, `app.js`, `style.css` ve yeni `textview.py` yayımlandı; kütüphane konteyneri yeniden başlatıldı. Ana uygulama v55, 237 HTTP dosya özeti ve 234 paket girdisi aynı kaldı. Hesap servisi, Access/DNS, kaynak PDF'ler ve yer imi veri alanı taşınmadı/değiştirilmedi. Test kayıtları ayrı önizleme alanında tutuldu; önizleme durduruldu.
- Kanıtlar `outputs/library-text/` ve Klipper `/opt/bilge-defter-library-text-v1/`. İlk kanıt kopyalama denemesi yayın sürerken dosya henüz oluşmadığı için başarısız oldu; tamamlandıktan sonra tekrar alındı. Paket/uygulama hatası değildi.
- Geri alma: `python3 /opt/bilge-defter-library-text-v1/deploy-text.py rollback`. Önceki üç dosya geri yüklenir; kullanılmayan yeni yardımcı dosya kanıt için kalır. v55 uygulamasını da geri almak gerekirse önce bu metin yayını geri alınmalıdır; eski betiklerin özet koruması güncel değişiklikleri ezmeyi engeller.
- Gerçek iPad'de tarayıcının **Türkçeye çevir** işlemi ve gerçek hesapla okuma kabulü henüz yapılmadı. Yeni PWA sürümü gerekmez; kütüphane sekmesini yenilemek yeterlidir. Commit/push/merge ve ücretli servis yoktur.

## v55 uygulama içi bağlantı — güncel yayın

- Ana menüde **Kütüphane**; sözlükte **Kütüphanede ara**. Seçili anatomi kavramı varsa taslak İngilizce karşılığı, yoksa yazılan terim kullanılır. Girdi değişince eski seçim hemen temizlenir. Sözlük metni hangi karşılığın gönderileceğini açıkça gösterir.
- Yalnız açık düğme tıklaması yeni sekme açar; not/PDF/el yazısı aktarılmaz. Terim giriş yönlendirmesine URL sorgusu olarak eklenmez; fragment içinde taşınıp kütüphane oturumu doğrulandıktan sonra aranır. Okunduktan sonra fragment temizlenir. Gerçek Access giriş turunda terimin korunması ayrıca cihaz kabulü bekler.
- Kaynaklar hâlâ İngilizcedir; bu değişiklik çeviri veya otomatik çok dilli kaynak taraması değildir. Kütüphane çevrimdışı çalışmaz; defterin mevcut yerel kayıt düzeni korunur.
- Dar telefonda altı menü düğmesi iki sıraya yerleşir. İlk testte dokunma alanı çakışması yakalanıp düzeltildi. Diğer ilk test hatası yeni sekme yerine aynı sayfada hash geçişini taklit eden testti; yeni yükleme senaryosu düzeltilerek tekrar geçti.
- **145 otomatik kontrol:** 30 yeni düğme, 12 kütüphane arayüzü, 12 önceki sözlük düzeltmesi, 40 terminoloji arayüzü, 14 giriş/PWA, 31 tablet/genel regresyon, 6 gerçek service-worker v54 → v55 güncellemesi. Hesap yanıtları ve notlar sentetiktir; gerçek Dilara hesabı/fiziksel iPad kabulü değildir.
- 237 dosyanın 230'u v54 ile aynı; yalnız sözlük, menü bileşeni/köprüsü ve sürüm dosyaları değişti. PDF v53 geliştirmesi eklenmedi. Paket SHA256: `aff91996f0b38aeccf2d3689ee5bbbe9602d767991ec3b0f33b209790f356c19`.
- Klipper önizleme ve canlı origin üzerinde 237 HTTP özeti, 234 çevrimdışı paket girdisi, 5 yetkisiz erişim reddi, sahte oturum reddi ve 5 kapalı yol doğrulandı. İnternetten temiz oturum Access girişine yönleniyor.
- `/opt/bilge-defter-classroom-v55`; davetli web konteyneri v55 ile değiştirildi. v54 konteyneri `bilge-defter-invited-web-rollback-v55` olarak korundu. Kütüphane konteynerinde yalnız `code/app.js` değişti; konteyner, özgün kitaplar ve yer imi verisi değişmedi. Diğer servisler ve hesap/Access/DNS ayarları korunmuştur.
- Kanıtlar: `outputs/v55/`. Geri alma: Klipper'da `python3 /opt/bilge-defter-classroom-v55/deploy-library-v55.py rollback`; hem v54 web hem önceki kütüphane betiği geri gelir, veriler silinmez. v1 kütüphane yayın betiği mevcut v55 için kullanılmamalıdır.
- Kurulu uygulama v54 gösteriyorsa **Ayarlar → Uygulama kurulumu → Güncellemeyi denetle**. Kayıt tamamlandıktan sonra açık Bilge Defter pencereleri kapatılıp yeniden açılır; tarayıcı verileri silinmez. Git commit/push/merge yapılmadı.

## İlk ayrı davetli yayın (v54) — yeniden denetim ve sınırlar

Kullanıcının canlı deneme onayıyla, yerel prototipten ayrı sunucu sürümü hazırlandı.

- Mevcut hesap servisi her istekte imzalı Cloudflare oturumunu doğrular; yalnız onaylı hesap kabul edilir. Yeni kayıt/giriş yöntemi veya hesap veritabanına doğrudan bağlantı eklenmedi.
- Yer imleri ayrı SQLite dosyasında hesap kimliğine göre ayrılır; hesap başına 500 kayıt. Eski hesap kimliğine bağlı istek 409 ile reddedilir. Defter notlarına aktarım veya not eşitleme değildir.
- Paket: 29 dosya; beş özgün PDF ve lisans kanıtları aynı özetlerle korundu. Yerel `saved.json`, test notları ve anahtarlar alınmadı.
- PDF indirmeleri parça parça gönderilir. Aynı anda bir önizleme, en çok 12 işleyici, 64 MiB önizleme alanı, 512 MiB RAM ve 0,75 CPU sınırı vardır. Sınıf yük kabulü yapılmadı.
- Yeni konteyner `bilge-defter-library-v1`; klasör `/opt/bilge-defter-library-v1`. Mevcut PDF çalışma imajı kullanıldı; paket/model kurulmadı. Kod/kaynak salt okunur, yalnız ayrı yer imi alanı yazılabilir; dışa açık yeni port yoktur.
- Yalnız davetli web sunucusuna `/library/` yönlendirmesi eklendi. Access, DNS, izin listesi, hesap servisi, Bilge Arena ve diğer servisler değiştirilmedi. Önce/sonra mevcut konteyner kimlikleri ve başlangıç zamanları aynı kaldı.
- Önizleme ve yayın sonrasında v54 uygulamasının **237 HTTP dosya özeti**, **234 çevrimdışı paket girdisi**, 2 yetkisiz API reddi ve 5 kapalı dosya yolu doğrulandı.
- **28 Python testi** (15 kaynak/API + 13 hesap/kayıt), **19 tarayıcı test grubu** (10 gerçek yerel kaynak + 9 davetli arayüz) geçti. 13 hesap testi ayrıca Klipper imajında geçti. Davetli tarayıcı testleri sentetik hesap yanıtlarıdır; gerçek kullanıcı girişi kanıtı değildir.
- Klipper gerçek MSU PDF sayfasını üretti. İnternetten temiz oturumla katalog, kütüphane ve PDF mevcut Cloudflare girişine yönlendi. İç sunucuda oturumsuz/sahte oturum 401 aldı.
- Tablet katalog görünümü incelendi; Chromium/WebKit testi gerçek iPad veya Dilara hesabı kabulü yerine geçmez.

### Dilara'nın kısa kabul testi

1. Bağlantıyı mevcut hesabıyla açar; gerekiyorsa e-posta doğrulamasını tamamlar.
2. `kalp`, `böbrek`, `sinir` arar; gösterilen İngilizce terimi ve açılan PDF sayfasını karşılaştırır.
3. Sayfayı kaydet → Kapat → Kaydettiklerim; yenileme ve kapatıp açma sonrasında yer imini görür.
4. Sayfa numarasıyla başka sayfaya gider; kaynak/lisans kaydını açar. İsterse özgün PDF'yi indirir (bazıları büyüktür).
5. Bulamadığı terimleri veya hata ekranını bildirir; şifre/doğrulama kodu paylaşmaz.

**Açık kalanlar:** gerçek hesapla uçtan uca kabul, fiziksel iPad/telefon testi, akademik değerlendirme, 50 kullanıcı yükü ve bağımsız yedek. Yer imleri kalıcıdır fakat otomatik/offsite yedek kurulmadı. Aynı disk üzerinde çoğaltma disk arızasına karşı yedek değildir. Kaynaklar İngilizcedir; sınırlı Türkçe terim eşleştirmesi vardır, çeviri/AI yanıtı yoktur. Ticari olmayan pilot kapsamı değişmedi.

### İşletim ve geri alma

- `/opt/bilge-defter-library-v1/state/bookmarks.sqlite3`: yalnız hesap kimliği, kaynak kimliği ve sayfa; ad, e-posta, not veya arama geçmişi tutulmaz.
- `before-nginx.conf`, `before.json`, `manifest.json`, `stage-proof.json`, `live-proof.json`: önce/sonra ve paket kanıtları. Yerel kanıtlar `outputs/library-pilot-release/` altındadır.
- Geri alma: Klipper'da `python3 /opt/bilge-defter-library-v1/deploy.py rollback`. Canlı yapılandırmanın bu yayına ait olduğu doğrulanır; eski v54 yönlendirmesi geri gelir. Kaynaklar/yer imleri silinmez. Sonradan yapılandırma değişmişse işlem durur.
- İlk ayrı yayın sırasında ana uygulama v54 kalmıştı. Güncel v55 geçişi yukarıda belgelenmiştir.
- Git commit/push/merge yapılmadı; mevcut ilgisiz çalışma ağacı değişiklikleri korundu.

## Yerel prototip kullanımı (ayrı veri alanı)

Bu bilgisayarda: <http://127.0.0.1:8766/>

Sunucu kapalıysa PowerShell'den:

```powershell
& 'D:\Projelerim\bilge-defter\work\library-pilot\Start-Pilot.ps1'
```

Pencere açık kalmalıdır; Ctrl+C sunucuyu durdurur. Başlatıcı mevcut Codex Python/Poppler araçlarını kullanır, kurulum veya indirme yapmaz. Başka bilgisayara taşımak için Python + pypdf ve Poppler pdftoppm çalışma ortamı gerekir. 8766 doluysa başka süreci kapatmayın.

1. `kalp` yazıp Ara'ya basın. Aranan özgün terim `heart` olarak görünür.
2. Bir sonucun PDF sayfasını açın. Sayfa sıra numarası dosyadaki gerçek sayfayla eşleşir.
3. Sayfayı kaydet'e basın, pencereyi kapatıp Kaydettiklerim'i açın.
4. Tarayıcıyı yenileyin; yer imi kalır. Sunucu yeniden başlatıldığında da diskten okunur.
5. Kaynak kaydı bölümünden PDF içindeki lisans sayfasını açın.
6. Özgün PDF'yi indir, zaten yerelde saklı orijinal dosyanın değişmemiş kopyasını verir.

**Kaydetme ayrımı:** Beş kitap ilk hazırlıkta diske indirilmiştir. Sayfayı kaydet bir yer imidir; tekrar kitap indirmez. Cihazlar arası eşitleme, öğrenci hesabı, Bilge Defter sayfasına aktarma veya bağımsız yedekleme değildir. Aynı bilgisayardaki pilotu kullananlar aynı yer imi listesini görür; çok kullanıcılı ürün değildir.

## Beş kaynak ve lisans incelemesi

Yayıncıların lisans beyanları ve indirilen **bu PDF sürümlerinin içindeki** lisans sayfaları karşılaştırıldı. Bu, tüm içeriğin bilimsel doğruluğu veya her üçüncü taraf görselin ayrı kullanım izni için onay değildir.

| Kaynak / yayıncı | Bildirilen kitap lisansı | PDF sayısı | Lisansın PDF sıra sayfası |
|---|---|---:|---:|
| [Human Physiology — LMU](https://lmu.pressbooks.pub/humanphysiology/) — Leslie Bach, Nour Al-muhtasib, Leslie King, Nicole Thometz | CC BY-SA 4.0 | 1.611 | 3 |
| [Foundations of Neuroscience — MSU](https://openbooks.lib.msu.edu/neuroscience/) — Casey Henley | CC BY-NC-SA 4.0 | 464 | 4 |
| [Human Anatomy and Physiology Laboratory Manual — ROTEL](https://rotel.pressbooks.pub/anatomyphysiology/) — Maria C. Carles | CC BY-NC-SA 4.0 | 541 | 4 |
| [A Mixed Course-Based Research Approach to Human Physiology — Iowa State](https://iastate.pressbooks.pub/curehumanphysiology/) — Karri Haen Whitmer | CC BY-SA 4.0 | 204 | 2 |
| [General Anatomy & Physiology — WisTech Open](https://wtcs.pressbooks.pub/anatphys/) — WisTech Open; tam katkıcı listesi özgün PDF'de | CC BY-NC-SA 4.0 | 1.397 | 4 |

Toplam: **5 ayrı eser, 4.217 PDF sayfası, 424.794.033 bayt (405,1 MiB)**. Yerel sayfa dizini ve geçici önizlemeler bu boyuta dahil değildir. Kitaplar ortak OpenStax/diğer kaynaklardan içerik uyarlayabilir; beş bağımsız bilimsel doğrulama sayılmaz.

- Kullanım: ticari olmayan eğitim pilotu. NC içeren üç kitap, ticari ürüne otomatik taşınamaz.
- Atıf, lisans ve özgün bildirimler korunur; hiçbir PDF yeniden yazılmadı, çevrilmedi veya birleştirilmedi.
- Kitapların “except where otherwise noted” istisnaları geçerlidir. Görselleri ayrı çıkarma, yeniden yayınlama, çeviri/uyarlama ve ticari kullanım için yeni değerlendirme gerekir.
- [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ve [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) koşulları kaynak bazında uygulanır. Eserlere ek DRM kısıtlaması konulmaz. Hukuki danışmanlık/onay verilmiş sayılmaz.
- Anatomi/fizyoloji öğrenimi içindir. Laboratuvar kitaplarının deneyleri bu pilotta uygulanmaz; insan denekli etkinlik, klinik karar ve gözetimsiz deney kapsam dışıdır.

### Alınmayan adaylar

- Oregon State Anatomy & Physiology 2e: yayıncı sayfasında BY-SA üst lisansı ve BY-NC-SA uyarlama/görsel notları birlikte bulundu. İleri incelemeye bırakıldı; indirilmedi.
- CUNY hazırlık kitabı 2. baskı ve JCCC BIOL225: lisans bulundu, fakat resmi PDF uç noktaları 403 verdi. Erişim engeli aşılmadı, başka ayna kullanılmadı.

## Nerede saklanıyor?

- Kod ve incelenen kaynak tanımları: `D:\Projelerim\bilge-defter\work\library-pilot\`
- Özgünler/dizinler/lisans kanıtı: `D:\Projelerim\bilge-defter\outputs\library-pilot\<kaynak-id>\`
- Her kaynak: `original.pdf`, `publisher.html`, `pages.json`, `receipt.json`.
- `accepted-sources.json`: incelenen beş PDF'nin SHA-256 özeti ve lisans sayfası. Yayıncı dosyayı değiştirirse içe aktarma durur; yeniden inceleme gerekir.
- `saved.json`: yalnız kaynak kimliği ve PDF sayfası; yerel pilot yer imleri. Testte eklenen bir örnek kayıt bulunabilir.
- `rendered/`: yeniden üretilebilir, en fazla 30 sayfalık önizleme önbelleği. Özgün PDF'ler bu temizleme işlemine dahil değildir.
- `ui-test-results.json` ve `catalog-*.png`, `reader-*.jpg`: test çıktıları.

Çıktı klasörü mevcut Git ignore kuralıyla dışarıda kalır. Büyük kitaplar PWA çevrimdışı paketine veya Git'e eklenmedi; sunucuda ayrı kaynak alanına kopyalandı. Yerel çıktı klasörünün silinmesi yerel kitapları ve yer imlerini kaybettirir; otomatik yedek oluşturmaz.

## Arama ve güvenlik sınırları

- Arama sayfa metninde basit kelime eşleşmesidir; anlamsal arama / OCR / soru cevap sistemi değildir.
- Sınırlı Türkçe terim eşleştirmesi açıkça gösterilir (kalp→heart, hücre→cell vb.). Diğer aramalar özgün İngilizce terimlerle yapılır. Kaynak başına en fazla 5 sonuç gösterilir; bu bir doğruluk/önem sıralaması değildir.
- PDF sıra numarası ve dosyanın basılı sayfa etiketi farklı olabilir. Görüntüleyici PDF sıra numarasını kullanır.
- Metin çıkarımında 5 kaynakta toplam 5 boş metinli sayfa var. Taranmış/görsel içi yazılar OCR'dan geçirilmedi. Bütün sayfalar/görseller tek tek incelenmedi.
- Görüntüleyici sayfayı PNG önizlemesi olarak gösterir; metin seçimi/ekran okuyucu ve tam büyütme için özgün PDF veya yayıncıya gidilmelidir. Tam erişilebilirlik kabulü yapılmadı.
- Sunucu yalnız `127.0.0.1:8766` üzerinde dinler. Sabit dosya rotaları, kaynak/sayfa denetimi, Host/Origin kontrolü ve yazma isteği başlığı bulunur. İnternete veya sınıf ağına açılmaya uygun bir üretim servisi değildir.
- Yerel arama/kayıt/önizleme sırasında harici ağ isteği yoktur. Yayıncı veya lisans bağlantısına kullanıcı basarsa internet gerekir.
- Sorgu ve okuma geçmişi HTTP günlüğüne yazılmaz. Gerçek öğrenci hesabı/notu kullanılmadı.

## İlk yerel pilotun doğrulaması

- **15 Python veri/API testi:** 5 ayrı dosya ve özetleri, sayfa sayıları, lisans kanıtı, gerçek metinde arama, her kaynakta sonuç, boş/hatalı sorgu, izin verilmeyen indirme hedefleri, dizin geçişi, Host/Origin, geçersiz sayfa, beş kaynaktan PNG, yetkisiz kayıt isteği, özgün PDF indirmesinin SHA-256 eşliği.
- **10 tarayıcı test grubu:** Chromium masaüstü + WebKit 820×1180; katalog, Türkçe terim eşleştirmesi, gerçek sayfa önizlemesi, kayıt/tekrar kaydetme, yenileme sonrası kalıcılık, geçersiz sayfa, sonuçsuz ve HTML benzeri sorgu, yatay taşma, JS hatası ve harici ağ isteği kontrolü.
- Yerel sunucu yeniden başlatıldı; kayıt dosyası korundu. İçe aktarmanın ikinci çalıştırılması dosyaları yeniden indirmeden özetlerini doğruladı.
- Beş kitaptan örnek PDF sayfası ve tablet boyutlu katalog ekranı görsel olarak incelendi. Bu örneklem, bütün 4.217 sayfanın görsel/akademik denetimi değildir.
- `git diff --check` geçti; mevcut ilgisiz değişiklikler korunmuştur.

### Denemede karşılaşılanlar

Python urllib istemcisi yayıncı uçlarında 403 aldı; aynı resmi adreslerde mevcut Windows HTTP istemcisi başarılıydı. Kimlik bilgisi, çerez aktarımı, ayna veya erişim kontrolü aşma kullanılmadı. Poppler paketinde `pdftotext` bulunmadığı için mevcut pypdf ile metin çıkarıldı. Yeni bağımlılık kurulmadı. Önerilen agent-browser CLI kurulu değildi; mevcut Playwright Chromium/WebKit kullanıldı.

## İlk pilotta belirlenen sonraki kabul kapıları

1. Kullanıcı pilotta en az 10 gerçek ders terimini arar; uygun sayfa bulma ve kaydetme kabulü verir.
2. Ders sorumlusu içerik düzeyi, güncellik, hata ve kaynak örtüşmesini inceler. Lisans incelemesi akademik kabul yerine geçmez.
3. Klipper ve hesap kapısı sonraki kullanıcı onayıyla bu belgenin üstündeki kapsamda tamamlandı. Defter sayfasına aktarma ve bağımsız yedekleme açık kalır.
4. Ardından gerçek iPad/telefon ve sınıf kabulü. Bu turda yalnız yerel tarayıcı motorları test edildi.
5. Çeviri eklenirse özgün metin, kaynak/sayfa, model/sürüm, çeviri etiketi ve insan kontrolü korunur. Önceki çeviri ölçümü otomatik yayına uygun kalite göstermedi; burada çeviri açılmadı.

İlk yerel pilotta yayın yapılmamıştı. Sonraki onayla davetli bağlantı yayımlandı; commit/push/merge ve ücretli API çağrısı yapılmadı.
