# v68 — sunucuda önceki kopya, sağlık kontrolleri, güvenli geri dönüş

28 Eylül 2026. İnceleme raporunun ([INCELEME_2026-09-28](INCELEME_2026-09-28.md)) v68 adayları:
sunucuda önceki şifreli kopya (A1'in sunucu tarafı), konteyner sağlık kontrolleri (B1),
geri dönüşte canlı sürüm ön kontrolü ve hesap servisinin geri dönüş provası (B2). Web ve hesap
servisi birlikte yayınlanır; kütüphane, Access, DNS, sırlar ve veri dosyası değişmez.

## Ne değişti

### Sunucuda önceki şifreli kopya

- **Neden:** Sunucu her hesap için tek kopya tutuyordu; yanlışlıkla gönderilen bir defter
  (örneğin başka bir cihazdan "Yereldekini gönder") önceki kopyayı geri dönüşsüz siliyordu. Gece
  yedeği 7 gün tutuyor ama öğrenci ona erişemez.
- **Sunucu** (`bilge_defter_store.py`): her yazım, üzerine yazdığı kopyayı aynı işlemde
  `bilge_defter_backup_previous` tablosuna taşır (hesap başına bir kuşak, `replaced_at` ile).
  Yazım reddedilirse (412 vb.) önceki kopya değişmez. Yeni uç `GET /backup/previous` yalnız hesabın
  sahibine döner; kimliksiz 401, başka hesap 404/409, onaysız 403. Tablo yalnız eklendiği için
  v65 hesap servisi aynı veritabanıyla çalışmaya devam eder (geri dönüş güvenli).
- **İstemci** (`sync-workspace.js`): "Kayıt ve eşitleme" penceresinde **"Önceki sunucu
  kopyası"** düğmesi. Parolayla açılır, normal yedek önizlemesinde gösterilir ("Önceki sunucu
  kopyası (tarih; yerine yenisi … tarihinde yazıldı)"); defter yalnız **Uygula**'dan sonra değişir.
  Önceki kopya yoksa ya da parola yanlışsa açık bir mesaj verilir ve defter değişmez. Eşitleme
  açıksa geri yüklenen defter sunucuya gider ve yerine geçtiği kopya yeni "önceki" olur; yani geri
  yükleme de geri alınabilir. Parola iletişim metinleri "sunucu son kopyayı ve bir öncekini tutar"
  olarak güncellendi.
- Depolama: hesap başına en çok iki şifreli kopya (her biri ≤ 5 MiB).

### Konteyner sağlık kontrolleri

`deploy-v68.py` yeni web ve hesap konteynerlerini Docker sağlık kontrolüyle kurar: web
`curl http://127.0.0.1/release.json`, hesap servisi konteyner içinde `/health`; 30 sn aralık,
3 deneme, 15 sn başlangıç payı. `stage` ve `activate`, ikisinin de `healthy` olmasını bekler.
Klipper'ın devops ajanı bu konteynerleri zaten izliyor; "unhealthy" artık orada da görünür.
Sağlık betiği (`work/monitor/bilge-defter-health.sh`) ilk ~30 saniyedeki "starting" durumunu
geçerli sayar.

### Geri dönüş: ön kontrol ve yeniden kurma

- `rollback` artık **hiçbir şeye dokunmadan önce** canlı `current` bağının v68 ya da v67'yi
  gösterdiğini, geri dönüş konteynerlerinin hazırlıktaki kimliklerle eşleştiğini ve
  `-failed-v68` konteyneri olmadığını denetler. Sıra dışı çalıştırma ([GERI_DONUS](GERI_DONUS.md),
  "Bilinen kusur") v68'de reddedilir.
- Durmuş geri dönüş konteyneri silinmişse hem web (v67 dosyaları) hem **hesap servisi** (v65
  imajı, özgün veri/sır/sözlük bağları) kayıtlı yapılandırmadan yeniden kurulur. Hesap servisi
  önce başlatılır (nginx upstream'i açılışta çözer).

### Hesap servisi geri dönüş provası

`rehearse` modu artık iki şeyi kurup sınar ve siler: v67 web (127.0.0.1:18806, v67
doğrulayıcısı) ve **v65 hesap servisi**: aynı ağda ayrı adla, `/data` yerine hazırlıkta alınan
veritabanı kopyası, sır bağı yok, Cloudflare eşitlemesi kapalı (`BILGE_DEFTER_EDGE_SYNC=0`),
yeniden başlatma yok. `/health` v65'i, veritabanı `quick_check` ok ve üye sayısını vermeli.
`activate` bu prova kanıtı olmadan çalışmaz.

## Yerel doğrulama

- **API** (`server-candidate/v49`, pytest): 82 test geçti (78 + önceki kopya: tam bir kuşak,
  başarısız yazımda değişmeme, hesaplar arası gizlilik, onaysız erişim). Yeni dört test v65
  sunucu koduna karşı kalıyor.
- **Tarayıcı** (`verify-v68-previous.cjs`, Chromium + WebKit, 6 kontrol): önizleme ve Uygula;
  önceki kopya yok / yanlış parola mesajı ve defterin değişmemesi; eşitleme açıkken geri
  yüklenen kopyanın gönderilmesi ve eskisinin yeni "önceki" olması; açık bir pencere varken
  eşitlemenin beklemesi.
- **Yayın aracı** (`test_deploy_v68.py`, sahte Docker, 6 kontrol): başka sürüm canlıyken ve
  yanlış kimlikte hiçbir komut çalışmadan ret; saklanan konteynerlerle hesap-önce geri dönüş;
  silinmiş konteynerlerin önceki imaj ve özgün bağlarla yeniden kurulması; provanın canlı veriye ve
  sırra dokunmaması; yeni konteynerlerde sağlık kontrolü.
- **Proxy testi** (`test-release-proxy-v68.py`, yalnız doğrulama imajında): gerçek nginx
  üzerinden önceki kopya, hesap ayrımı ve 401.
- **Regresyon** (`verify-v68.cjs`, v67 temel paketi Git'ten `4953adb` → `bdc4b8eb…` ile yeniden
  üretildi): 21 paket ve `verify-reliability.cjs` geçti; v67 → v68 service-worker güncellemesi iki
  motorda geçti. Bilinen oynak `verify-v61-save` WebKit PDF eşiği tam koşuda bir kez kaldı (47'ye
  48 ms), üç tekrarda geçti (47/78, 47/79, 47/63); eşik değiştirilmedi.
- **Negatif kontrol:** `verify-v68-previous.cjs` v67'ye karşı ilk iddiada kalıyor (düğme yok).
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

(kullanıcı onayı bekleniyor)
