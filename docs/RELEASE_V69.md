# v69 — iPad'de kayıt kararlılığı

2 Ekim 2026. Tetikleyen: öğrencinin "uygulama habire yedek almada problem yaşıyor" bildirimi
(iPad, PDF eklenmiş defter). Yalnız web değişir; hesap servisi v68, kütüphane, nginx beyaz listesi,
veri, Access ve DNS aynı kalır.

## Bulgu

Sunucuda yedek ucu hatası yoktu (son 48 saatte hiç yedek isteği yok); şikâyet yerel kayıttaki
"Kaydedilemedi — yedek alın" bandıydı. Kod incelemesi ve ölçüm:

- Her kalem kaydı defterin **tamamını** (PDF sayfalarının PNG görüntüleri dahil) metne çevirip
  kayıt işçisine gönderiyordu. İşçi kayıtlı defterin tamamını IndexedDB'den geri okuyup yeniden
  metne çevirerek karşılaştırıyor, sonra hepsini yeniden yazıyordu. Ayrıca son kaydın tam metnini
  kalıcı olarak tutuyordu.
- Tek bir Türkçe harf (ş, ğ, ı, İ) birleşik metnin tamamını 2 baytlık dizgiye çeviriyordu.
- Uygulama arka plana geçerken, kapanırken **ve odak kaybında** (Denetim Merkezi, dosya seçici)
  tam kayıt zorlanıyordu; iPadOS'un en az süre ve bellek tanıdığı an en pahalı kayıt yapılıyordu.
- İlk geçici hatada bant hemen çıkıyor, her kalem darbesi yeniden tam deneme yapıyordu ("habire").
- Sayaçlar askıya alınma süresini de sayıyordu: uygulama geri açılınca sahte "işçi kayboldu".
- Hatanın nedeni yalnız ekranda kalıyordu; hiçbir yere kaydedilmiyordu.

Ölçüm (masaüstü, sentetik; 3 fotoğraflı PDF, 68 MB defter, Türkçe başlık):

| | v68 | v69 |
|---|---|---|
| Kalem kaydı başına JS bellek tepesi, sayfa + işçi (Chromium/V8, CDP) | 892 MB | 552 MB |
| İşçinin kayıtlar arasında tuttuğu bellek (V8) | 136 MB | 0 |
| Kayıt başına işçinin IndexedDB'den geri okuduğu veri | defterin tamamı | 0 (yalnız küçük işaretçi) |

Sınırlar, dürüstçe:
- V8 ölçümü, tarayıcı API'lerine verilen büyük dizgileri (JS yığınından taşınanları) tam
  saymaz. WebKit'te süreç belleği de ölçüldü ama masaüstü WebKit çöp toplamayı bol RAM'e göre
  geciktirdiği için tepe değerler (v68 3,9 GB, v69 2,7 GB) iki sürümü güvenilir biçimde ayırmaz;
  iPad'de çöp toplama çok daha erken çalışır. Güvenilir olan kopya sayısıdır: v68 kayıt başına
  yaklaşık 8–12, v69 yaklaşık 5–8 defter kopyası.
- Sayfa tarafında Chromium, `replace` sonucunu kaynak dizgi 2 baytlıysa 2 baytlık bırakıyor;
  tek baytlık aktarım işçide ölçüldü (204 MB = 3 kopya), sayfada etkisi sınırlı kaldı.
- **iPad'de doğrulanmadı.** Kesin teşhis için yeni tanı günlüğü gerekiyor (aşağıda).
- Asıl çözüm, PDF/görsel verisini defter kaydından ayırmak (v70 adayı). v69 yükü azaltır ve
  nedeni görünür kılar; çok büyük PDF defterlerinde kayıt hâlâ ağırdır.

## Ne değişti

**Kayıt işçisi (`save-worker.js`)**
- Karşılaştırma artık küçük `app-writer` işaretçisi (yazan, kayıt no, uzunluk) üzerinden: disk
  üzerindeki işaretçi işçinin son yazdığıysa kimse yazmamıştır, büyük kayıt okunmaz. İşaretçisi
  güvenilir olmayan eski kayıtta (v65 ve öncesi) ilk kayıtta bir kez tam karşılaştırma yapılır.
- İçe aktarmada (önceki kopyayı saklamak için) kayıt yine okunur.
- Devralma (işçi kaybından sonra) nadir yol olduğu için tam kaydı okuyup uzunluğu da denetler
  (v66–v68 güvencesi korunur) ve bulduğu işaretçiyi sayfaya bildirir; sayfa onu son kaydı sayar.
  v68'de bu yapılmıyordu: işçi devraldıktan hemen sonra yine kaybolursa sahte çakışma çıkıyordu.
- Kota dolması, klonlanamayan değer ve çakışma yeniden denenmez; bağlantı kopması bir kez denenir.

**Sayfa (`index.html`)**
- Kayıt metni 0xFF üstü karakterleri `\uXXXX` olarak taşır (tek baytlık dizgi). Saklanan kayıt ve
  onun `JSON.stringify` hali değişmez. Eşitleme düz `JSON.stringify` kullanır; alındı özetleri v68
  ile aynı kalır.
- Sayfa yolu (işçi başlamazsa) da işaretçiyi yazar; böylece işçili sekme bu yazımı görür.
- İlk geçici hata sessizce yeniden denenir ("Kayıt yeniden deneniyor…"); bant ikinci ardışık
  hatada, 15 sn sonra ya da kalıcı hatalarda (çakışma, cihaz dolu, geçersiz defter) hemen çıkar.
  Yeniden denemeler 2-4-8-16-30 sn aralıkla ve sayfa görünürken yapılır; bu sürede kalem
  darbeleri ayrı deneme başlatmaz. Elle "Yeniden dene", ayrılma, içe aktarma ve çıkış hemen dener.
- Cihaz dolu (`QuotaExceededError`) açık bir mesajla, doğrulama reddi `InvalidNotebook` koduyla
  gösterilir.
- Kayıt işçisi sayaçları yalnız görünür geçen süreyi sayar.
- Arka plana geçerken: 8 MB'a kadar defterde eski tam denetim ve tam kayıt sürer; daha büyük
  defterde yalnız değişen sayfalar kaydedilir, denetim boşta ve görünürken yapılır. Odak kaybı
  yalnız kalem hareketini bitirir, kayıt başlatmaz. "Tam kayıt" işareti artık takılı kalmaz.
- "Yükleme öncesi kopyayı geri getir" düğmesi kopyanın varlığını sayarak denetler; kopyayı
  açmaz (açarken yine doğrulanır).
- **Tanı günlüğü:** kayıt hataları (ad, ileti, boyut, süre, tam/önbellekli), işçi kaybı,
  devralma, yavaş kayıt, gizlenme/görünme ve her açılış localStorage'da son 80 olay olarak tutulur.
  Görünürken 10 sn'de bir "yaşıyor" işareti yazılır, gizlenirken "temiz" işaretlenir; açılışta
  önceki oturum görünürken bitmişse kaydedilir (bellek yüzünden kapatılma adayı). "Kayıt ve
  eşitleme" penceresinde özet ve "Tanı günlüğünü indir" var. Not içeriği, hesap ve kalem konumu
  yoktur; sunucuya gönderilmez.

**PDF (`pdf-workspace.js`)**
- Yeni PDF, defter kaydını 48 MB'ın üstüne çıkaracaksa yol gösteren mesajla reddedilir; daha
  büyük mevcut defterler çalışmaya devam eder. Eklemeden önce boş alan (`storage.estimate`)
  denetlenir.
- Doğrulayıcı JPEG sayfa görüntülerini de okur ve boyutunu denetler (v69 hâlâ PNG yazar). Böylece
  daha küçük JPEG yazacak sonraki sürüm v69'a güvenle geri dönebilir.

**Eşitleme (`sync-workspace.js`)**
- Kayıt metni 15 MiB'ı aştığında (5 MiB sınırının kesinlikle üstü) eşitleme her düzenlemede
  defteri yeniden serileştirip şifrelemeye çalışmaz; durum mesajı kalır.

## Bilinen ödünleşimler

- Normal kayıt yolunda, işaretçiyi güncellemeden yazan bir yazıcı (v65 ve öncesi bir sekme ya da
  v66–v68'in işçisiz sayfa yolu) aynı anda açıksa yazdığı fark edilmez. Hizmet çalışanı güncellemesi
  bütün pencereler kapanmadan etkinleşmediği için iki sürüm aynı anda açık olamaz; devralma yolu
  bu durumu yine yakalar.
- 8 MB üstü defterde ayrılırken önbellek kaçırması (sayfa önbelleğinin bir değişikliği görmemesi)
  yalnız boştaki denetimle yakalanır.
- 48 MB sınırı bir ürün kararıdır; v70'te PDF verisi ayrı saklanınca kaldırılabilir.

## Yerel doğrulama

- `verify-v69-save.cjs` (Chromium + WebKit, 14×2 = 28 kontrol): kaydın büyük kaydı geri
  okumaması ve tek baytlık metin; başka sekmenin ve işçisiz sayfa yolunun yazdığının çakışma olarak
  yakalanması; devraldıktan sonra yeniden kaybolan işçi; sessiz yeniden deneme ve günlük; geri
  çekilme ve bant; cihaz dolu; geçersiz defter; görünür süre sayacı; ayrılma davranışı; tanı
  dosyasında not içeriği olmaması; JPEG okuma; 48 MB sınırı; kurtarma düğmesi.
- Negatif kontrol: aynı paket v68'e karşı ilk iddiada davranış olarak kalıyor (işçi `app`'i her
  kayıtta okuyor).
- Tam regresyon (`verify-v69.cjs`: v64 listesi + v66/v67/v68/v69 paketleri, Chromium + WebKit) ve
  `verify-reliability.cjs` geçti. v61 kayıt paketindeki "kayıt metni = `JSON.stringify`" değişmezi
  v69 için "kayıt metni = kaçışlı `JSON.stringify`" olarak eşlendi (runner'da, kaynak test değişmedi).
  Paket özeti (SHA256SUMS): `95e9ca51…`.
- `test_deploy_v69.py` (sahte Docker, 6 kontrol): başka sürüm canlıyken ve yanlış kimlikte
  hiçbir komut çalışmadan ret; saklanan v68 web'e dönüş; silinmiş konteynerin önceki dosyalar ve
  sağlık denetimiyle yeniden kurulması; provanın loopback'te kalıp silinmesi; yeni web'de sağlık
  denetimi; hesap servisine hiç dokunulmaması.
- Fiziksel iPad testi yapılmadı.

## Yayın

Kullanıcı onayıyla ("Evet, canlıya al") 2 Ekim 2026 akşamı canlıya alındı. Kaynak
`cf06b8d8c72b79cf9e79f27e11d885446fa88e2a`, paket `698d6735…` (246 dosya), web SHA256SUMS `95e9ca51…`,
nginx `3f3ef2ae…` (değişmedi). PR #7 master'a alındı (`1d79c1d`).

- **prepare:** canlı v68 web ve v68 hesap servisi (görüntü ve `healthy`) doğrulandı; anlık görüntüler alındı.
- **stage:** önizleme web (18800) 238/235/14/6, Docker sağlık denetimi `healthy`.
- **rehearse:** v68 web kayıttan 18806'da kuruldu, v68 doğrulayıcısıyla 238/235/14/6, silindi.
- **activate:** web v69 238/235/14/6, `healthy`; hesap servisi v68 değişmedi (3 gündür ayakta);
  diğer servisler değişmedi; `-rollback-v69` (v68 web) durmuş halde.

**Bağımsız kontroller:** `current` → v69/ui; canlı `index.html`, `save-worker.js`, `sync-workspace.js`,
`pdf-workspace.js`, `sw.js`, `release.json` baytları `cf06b8d` ile aynı; sağlık betiği
`web v69 api v68: 15 kontrol`; genel adres Access girişine 302.

**Henüz yapılmadı:** fiziksel iPad kabulü. Öğrenci uygulamayı tamamen kapatıp açınca v69 iner;
sorun sürerse "Kayıt ve eşitleme" › "Tanı günlüğünü indir" dosyası kesin nedeni gösterir.

Geri dönüş (v69 ya da v68 canlıyken; web v68, hesap servisi zaten v68):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v69/deploy-v69.py rollback
```
