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

## Hazırlıkta yakalanan hata: imaja eski kod girdi

İlk `stage`, önizleme hesap servisinin `/health` sürümü `v65` döndüğü için durdu. Paketteki
`main.py` v68 idi; imajın içindeki v65'ti. Neden: yayın paketi dosyaları mtime 0 ile çıkarıyor,
`main.py`'nin iki hâli aynı boyutta ("v65"→"v68") ve BuildKit yerel bağlamı boyut+zamanla artımlı
aktardığı için dosyayı değişmemiş saydı. Canlıya hiçbir şey geçmedi; yarım hazırlık (önizleme
konteyneri ve `/opt/bilge-defter-classroom-v68`) silindi. `deploy-v68.py stage` artık yapımdan
önce bağlam dosyalarının zamanını tazeliyor, `--no-cache` ile yapıyor ve yapımdan sonra **her iki
imajın içindeki her `/srv/app` dosyasını paketle bayt bayt karşılaştırıyor**; uymazsa durur
(commit `d29af55`).

## Yayın

Kullanıcı onayıyla ("Evet, canlıya al") 28 Eylül 2026 akşamı canlıya alındı. Kaynak
`d29af55329dbd1152e0419ab3ad813e36c79c692`, payload `158dbb43…`, nginx `3f3ef2ae…` (değişmedi).

- **prepare:** hesap veritabanının tutarlı kopyası `f7b7b43b…` (v65 hazırlığındakiyle aynı bayt;
  veritabanına 23 Eylül'den beri yazılmamış). Kopya bu bilgisayara alındı
  (`outputs/v68-private-backup`, yalnız kullanıcıya açık ACL): hash aynı, `integrity_check` ok,
  tablo satırları canlıyla birebir; `offhost-backups.json` buna göre yazıldı.
- **stage:** imaj içi dosyalar paketle aynı; 83 API testi; gerçek nginx üzerinden proxy testi
  (koşullu okuma, önceki kopya, hesap ayrımı, 146.532 sözlük maddesi); önizleme web
  238/235/14/6; iki konteynerin Docker sağlık kontrolü `healthy`.
- **rehearse:** v67 web (18806) ve v65 hesap servisi (veritabanı kopyası, sırsız, eşitleme
  kapalı) kayıttan kuruldu, doğrulandı (DB ok, 2 üye), silindi.
- **activate:** hesap servisi `/health` v68; bağlar ve ortam değişmedi; web 238/235/14/6;
  iki konteyner `healthy`.

**Bağımsız kontroller:** `current` → v68/ui; canlı `sync-workspace.js`, `index.html`, `sw.js`,
`release.json` baytları `d29af55` ile aynı; **canlı hesap konteynerindeki 12 uygulama dosyası
paketle aynı**; kimliksiz `/backup/previous` 401; sağlık betiği `web v68 api v68: 15 kontrol`;
genel adres 302. `bilge_defter_backup_previous` tablosu ilk yedek işleminde oluşacak (şu an
yok; ek tablo, v65'e dönüşü etkilemez). Geri dönüş konteynerleri: `-rollback-v68` (v67 web ve
v65 hesap) durmuş halde.

**Henüz yapılmadı:** fiziksel iPad ve gerçek hesapla kabul (önceki kopya düğmesi dahil); push
ve `master`.

Geri dönüş (v68 ya da v67 canlıyken; web v67 + hesap v65; silinmiş konteynerleri kayıttan kurar):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v68/deploy-v68.py rollback
```
