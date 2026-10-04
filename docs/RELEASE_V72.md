# v72 — v71 incelemesinin düzeltmeleri

2 Ekim 2026. Codex'in v71 incelemesi (not #101716, bulgular disc#2053–2056) üzerine. Yalnız web
değişir; hesap servisi v68, kütüphane, nginx beyaz listesi, veri, Access ve DNS aynı kalır. Kayıt
biçimi v71 ile aynıdır.

## Bulgular ve düzeltmeler

- **#2053 (P1) — eşitlemenin boyut ön kontrolü küçük kayda bakıyordu.** v71'de görüntüler anahtara
  geçince `lastSaveBytes` KB'a iniyor; eşitleme ise her düzenlemeden sonra görüntülü tam metni
  serileştirip şifrelemeye çalışıp ancak sonra 5 MiB sınırında reddediyordu. Artık alt sınır
  görüntülerden hesaplanır (`syncCertainlyTooLarge`): görüntüler ASCII'dir ve en az kendi boyutları
  kadar yer tutar; kaydın kalanı en az üçte biri kadar. Bu, v71'in benim kaçırdığım bir yan etkisiydi.
- **#2054 (P1) — yarıda kalan göç kotayı tüketiyordu.** Görüntüler tek tek yazılıyor ama kayıt ancak
  hepsi başarılıysa anahtara geçiyordu. Ortada cihaz dolarsa yazılanlar, satır içi kopyalarıyla
  birlikte diskte kalıyordu. Artık yazılabilen görüntüler hemen kullanılır, kayıt küçülür ve satır
  içi kopyaların yeri boşalır; hata tanı günlüğüne (kaç görüntü yazıldığıyla) düşer ve kalan göç 5 dk
  sonra yeniden denenir.
- **#2055 (P2) — görüntüsüz defterde temizlik hiç çalışmıyordu.** Temizlik, bellekte hiç saklı görüntü
  yoksa erken dönüyordu; son görüntü silinince eski yetimler hiç toplanmıyordu. Artık disk her zaman
  taranır; kurallar aynıdır (adsız, açık sayfada kullanılmıyor, 7 günden eski).
- **#2056 (P2) — PDF ekleme ve yedek yükleme göçü başlatmıyordu.** Bu yollar kaydı doğrudan yazıyor ve
  göç taramasını zamanlamıyordu; görüntüler bir sonraki kayda kadar satır içi kalıyordu. Artık ikisi
  de taramayı zamanlar. Ek olarak, tarama sürerken gelen istek artık kaybolmaz: tarama bitince yeniden
  zamanlanır (aksi halde aynı açık başka yoldan geri gelirdi).

## Codex yeniden incelemesi (not #101718, disc#2058)

- **#2053 kısmi kalmıştı:** sınır görüntüleri tekil sayıyordu; eşitleme metni kopyalanmış sayfa ve Çöp
  Kutusu tekrarlarını ayrı ayrı taşır. Artık her tekrar sayılır (`imageOccurrenceBytes`), depolama
  tekilleştirmesi aynı kalır. Test gerçek eşitleme yolundan geçer (taklit sunucu, parola, kopya ve Çöp
  Kutusu durumları): düzenlemelerden sonra büyük metin kodlanmaz, sunucuya istek gitmez.
- **#2058:** bekleme süresi dolunca yeniden deneme zamanlanmıyordu. Artık ayrı bir zamanlayıcı var;
  sayfa gizliyse görünür olunca dener. Test sanal saatle, bekleme süresine ve taramaya elle dokunmadan.
- Ek yarış: zamanlayıcı bir tarama sürerken tetiklenirse istek kayboluyordu; artık hatırlanır.
- Negatif kayıtlar `outputs/v72-negative/` (v71'e karşı 4/4 blok kalır; incelenen `e48f782`'ye karşı
  #2055 dışındaki 3 blok kalır).

## Yerel doğrulama

- `verify-v72-fixes.cjs` (Chromium + WebKit, 6×2 = 12 kontrol): kopya sayfa ve Çöp Kutusu için
  gerçek eşitleme yolu, kısmi göç ve kendiliğinden yeniden deneme, görüntüsüz defterde temizlik,
  PDF/yedek yükleme ve devam eden tarama yarışı, yayınlanmış v71 paketinin v72 defterini açması.
- **Negatif kontrol:** her bulgunun testi v71'e karşı ayrı ayrı (`ONLY=n`) davranış olarak kalıyor:
  #2053 "images over 5 MiB hold sync" iddiası; #2054 kısmi göç 0 döndürüyor; #2055 temizlik 0
  siliyor; #2056 "not keyed: 1 assets, 1 inline".
- `c7144ed` sonrası tam regresyon 2 Ekim 2026 21:46 (Türkiye) tamamlandı:
  `verify-v72.cjs` içindeki 26 regresyon grubu ve `verify-reliability.cjs` içindeki 26 ek
  güvenilirlik kontrolü geçti (`outputs/v72-regression.log`: `EXIT_V72 0`, `EXIT_REL 0`).
  Yerel Chromium/WebKit kontrolleri; fiziksel iPad veya canlı e-posta girişi değildir.
- `node work/build-invited.cjs` yeniden çalıştırıldı: 235 çevrim dışı varlık, 238 yayın dosyası.
  Paket manifestinin SHA-256 özeti:
  `a602e5241d06aefa7b0f9aea2976bb81fb2ccc071fff5c816a01c812adcd93dc`.
- `python -B work/test_deploy_v72.py` yeniden çalıştırıldı: sahte Docker ile 6/6 geçti.
- Devralma sırasında `node work/verify-v72.cjs verify-v72-fixes.cjs` de yeniden çalıştırıldı:
  Chromium + WebKit 12/12, çıkış kodu 0. Tam regresyon kaydının SHA-256 özeti:
  `16a01c3f377346592a6b8aa734f5c21bdbb50c93683e6a6a160e6b38bbe9ffee`.
- Fiziksel iPad testi yapılmadı.

## Öneri (Codex)

Öğrenciler yaygın kullanmadan önce JSON yedeği almaları. Geri dönüş v70'in altına inmemeli (v71'den
bu yana geçerli).

## Yayın

Kullanıcının 2 Ekim 2026 tarihli “işi sen devral ve tamamla” isteğiyle Codex devraldı
(merkezi CLAIM #101728; önceki Claude CLAIM #101717, devir notu #101724).
**v72 canlıya alındı ve yayın sonrası yeniden doğrulandı.** Kaynak
`8ef7550118f81ee7ac7da96e3e9f82d024b0ae74`; PR #10, `synthetic-checks` geçtikten sonra
`f4e690bbbb3c1e674651fadf5202f48d30c60633` ile master'a birleştirildi. Bu belgeyi ekleyen
sonraki commit yalnız yayın kanıtıdır; paket kaynağı yukarıdaki commit olarak kalır.

- Paket: 246 dosya, SHA-256
  `806501f593e85a64a1c9e7d049e306e0b877cb2676ee9274e7f3a5f08e0f855f`.
- `prepare`: canlı v71 ve hesap v68 doğrulandı; özel dizine geri dönüş yapılandırması kaydedildi.
- `stage`: loopback 18800 üzerinde v72, 238 HTTP dosya özeti, 235 çevrim dışı varlık,
  14 yetkisiz istek reddi, 6 korumalı yol kontrolü; Docker `healthy`.
- `rehearse`: v71, anlık görüntüden loopback 18806 üzerinde yeniden kuruldu ve aynı
  238/235/14/6 kontrollerinden geçti; yalnız prova konteyneri kaldırıldı. Canlı trafik
  geri alınmadı; bu, tam trafik geri dönüş testi değildir.
- `activate` ve bağımsız tekrar `verify`: v72 238/235/14/6, `healthy`.
  `current` → `/opt/bilge-defter-classroom-v72/ui`.
- Sağlık betiği: web v72 / API v68 **15/15**. Genel adres **302 Cloudflare Access**;
  izin sınırı korunuyor. Kimliği doğrulanmış öğrenci oturumu denenmedi.
- Hesap servisi v68, kütüphane, veri, Access, DNS ve diğer servisler değişmedi. nginx özeti
  `3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf` aynı.
- Önceki v71 web, `bilge-defter-invited-web-rollback-v72` adıyla durmuş halde korunuyor.

Sunucu kanıtları `/opt/bilge-defter-classroom-v72/{stage-proof,rehearsal-proof,live-proof,source-receipt}.json`;
yerel kopyaları `outputs/v72-publication-codex/`. Kaynak makbuzu yerel paketle birebir eşleştirildi.
Önceki, `e48f782` kaynaklı yayın çıktısı `outputs/v72-release-before-8ef7550/` altında korundu;
yeni yayın için kullanılmadı. Merkezi yayın kaydı #101734; bulgular #2053–2056 ve #2058,
kod/test/yayın kanıtıyla kapatıldı. Fiziksel cihaz kabulü bu kapanışın kapsamında değildir.

**iPad kabulü hâlâ gerekli:** önce JSON yedeği alın; uygulamada v72 göründüğünü doğrulayın.
Görselli/PDF defterde yazma, iki parmak kaydırma, arka plana alıp geri dönme ve kapatıp yeniden
açmada yazı/görsel korunumu denenmeli. Tarayıcı verilerini silmeyin; yedek, eşitleme ve yerel
kayıt aynı şey değildir.

Geri dönüş (v72 ya da v71 canlıyken; web v71):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v72/deploy-v72.py rollback
```

## 4 Ekim 2026 — yayın sonrası denetim ve ön izleme olayı

Codex'in salt okunur denetimi (not #101812): canlı v72 manifesti `a602e524` yayınlanan paketle
aynı; 238 HTTP dosya özeti, 235 çevrim dışı varlık, 14 yetkisiz istek reddi, 6 korumalı yol;
sağlık betiği 15/15; genel adres 302 Access. GitHub `master` `54835dd` ve çalışma dalı aynı ağaç.

**Ön izleme konteyneri beklenmedik şekilde çalışıyordu.** `activate` 2 Ekim 22:01'de
`-preview-v72`'yi durdurmuştu; 4 Ekim 02:01:49'da yeniden başlamış (loopback 18800), 02:02:03'te
`-rollback-v72` (v71 web, `unless-stopped`) de başlatılmaya çalışılmış ve 18790 canlıda olduğu için
`Exited (128)` "port is already allocated" ile kalmış. İz (klipper journal + dockerd günlüğü): aynı
saniyelerde surer makinesinden (Tailscale 100.96.68.104) linux-ai-server `/dashboard` açılmış ve
`/api/v1/shell/exec` çağrıları gelmiş; dashboard'ın konteyner paneli `docker <eylem> <ad>` koşar.
Yani kaynak dashboard'daki başlat düğmesidir, cron/devops ajanı/deploy betiği değil (o pencerede
`cron_outcomes` yalnız `pass`, `remediation_log`'da bilge-defter kaydı yok). Komut gövdesi
sunucuda hiçbir yere yazılmadığı için düğmeye kimin bastığı günlükten çıkmaz. Canlı trafik hiç
etkilenmedi; her 5 dakikadaki sağlık denetimi aralıksız `pass`.

Yapılan: `docker stop bilge-defter-invited-web-preview-v72` (4 Ekim 12:30, surer oturumu);
sağlık 15/15. `-rollback-v72` dokunulmadı: kimliği `private/` anlık görüntüsüyle aynı
(`6552f4a78f86`), `Exited (128)` kaydı `rollback` ön kontrolünü etkilemez (betik kimliği
doğrulayıp `docker start` eder; o anda 18790 boşalmış olur). Kural: [ISLETIM §8](ISLETIM.md).

**Gerçek verili geri yükleme sınırı.** Günün `/backups/klipper-volumes/2026-10-04/` arşivleri
geçici dizine açıldı: `integrity_check` ok, satır sayıları canlıyla birebir (üye 2, denetim 2, edge 1,
şifreli yedek 0, yer imi 1). `bilge_defter_backups` boş: hiçbir öğrenci sunucuya şifreli defter
göndermemiş. Dolayısıyla "öğrencinin görselleri ve PDF'leriyle geri dönüş" sunucu yedeğinden
sınanamaz; yalnız gerçek iPad'den alınan JSON yedeğinin uygulama içinde yüklenmesiyle sınanır ve
bu, aşağıdaki iPad kabulünün parçasıdır.
