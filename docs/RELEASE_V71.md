# v71 — PDF ve görselleri ayrı saklama açık (yazıcı + göç + temizlik)

2 Ekim 2026. v70'te kurulan ayrık görüntü deposunun yazma yarısı. Yalnız web değişir; hesap
servisi v68, kütüphane, nginx beyaz listesi, veri, Access ve DNS aynı kalır. Biçim ve gerekçe için
bkz. [RELEASE_V70](RELEASE_V70.md).

## Ne değişti

- **Yazıcı açık** (`ASSET_WRITE=true`). Bir kayıttan 2 sn sonra (ve açılıştan 2 sn sonra) defterdeki
  satır içi görüntüler bulunur; her biri SHA-256 anahtarıyla kendi küçük işleminde bir kez yazılır;
  yazım bitince kayıt anahtarlara geçer. Mevcut defterler böylece kendiliğinden göç eder.
- **Kayıt işçisinde koruma:** kayıt metni hangi görüntü anahtarlarını adlandırıyorsa (`"image":"asset:…"`)
  hepsinin diskte olduğu, kaydı yazan **aynı işlemde** sayılır. Biri yoksa yazım `MissingAsset` ile
  reddedilir; sayfa o anahtarı bırakır, kaydı o görüntü satır içi olarak bir kez daha dener, sonraki
  tarama görüntüyü yeniden saklar. İşçisiz sayfa yolu aynı denetimi yapar.
- **Temizlik:** oturumda bir kez, açılıştan 30 sn sonra ve sayfa görünürken. Bir görüntü yalnız
  kayıt da yükleme öncesi kopya da onu adlandırmıyorsa, bu sayfada açık hiçbir görüntü onu
  kullanmıyorsa **ve** 7 günden eskiyse silinir (başka açık bir sekme onu az önce saklamış olabilir).
  Okuma ve silme tek işlemdedir. Silinmiş bir anahtarı adlandıran kayıt yukarıdaki korumaya takılır.
- **PDF sınırı** artık defterdeki görüntülerin toplamını sayar (kayıt küçüldüğü için kayıt boyutu
  anlamsızdı) ve 96 MB'dır: kalem kaydı görüntüleri artık yazmıyor; kalan maliyet görüntülerin
  bellekte tutulması ve açılıştaki doğrulamadır.
- **Ayrılırken:** anahtar kullanan defterde tam yeniden yazım yapılmaz (tam doğrulama her görüntünün
  başlığını çözer).

## Ölçüm

Masaüstü, sentetik: her sayfası farklı fotoğraf benzeri görüntü taşıyan 40 sayfalık PDF defteri,
satır içi yazılıp v71 ile yeniden açıldı:

| | Chromium (75,5 MB görüntü) | WebKit (61,3 MB görüntü) |
|---|---|---|
| Kalem kaydı, göçten önce | 531–655 ms | 882–997 ms |
| Kalem kaydı, göçten sonra | 17–37 ms | 27–50 ms |
| Defter kaydı | 75,5 MB → 14,3 KB | 61,3 MB → 14,3 KB |
| Tek seferlik göç (2 sn bekleme dahil) | 2,9 sn | 3,2 sn |

v70 ölçümü (Chromium, sayfa + işçi JS belleği, 45 MB): kalem kaydı başına bellek tepesi 371 → 7 MB.
iPad'de ölçülmedi.

## Geri dönüş

v71 → v70 güvenlidir: yayınlanmış v70 paketi (Git'ten yeniden üretilip özeti canlıyla eşleşen
`0f9e4b5f…`) v71'in yazdığı anahtarlı defteri bütün görüntüleriyle açar ve kayıtta anahtarları
korur — bu, testte aynı depolama üzerinde gerçek v70 baytlarıyla doğrulandı. v70'ten v69'a dönüş ise
anahtarlı defterleri açamaz; v71 bir kez canlıya çıktıktan sonra zincir v70'te durmalıdır.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v71/deploy-v71.py rollback
```

## Bilinen sınırlar

- Görüntüler bellekte hâlâ bir kopya olarak durur; sayfa açıldıkça yükleme sonraki iş.
- Açılış ve tam kayıt bütün görüntüleri doğrular; büyük defterde açılış birkaç saniye sürebilir.
- Temizlik 7 günden yeni yetim görüntüleri bekletir; silinen PDF defterlerinin yeri bir hafta sonra açılır.

## Yerel doğrulama

- `verify-v71-assets.cjs` (Chromium + WebKit, 7×2 = 14 kontrol): yeni defterin kendiliğinden
  göçü; gerçek v70 paketinin v71 defterini açması ve anahtarları koruması; silinmiş görüntüye
  başvuran kaydın reddedilip satır içi yeniden denenmesi ve görüntünün yeniden saklanması; temizliğin
  yalnız eski ve adsız görüntüyü silmesi; 96 MB görüntü sınırı; mevcut satır içi defterin açılışta
  göçü; işçisiz sayfa yolunda aynı koruma.
- Tam regresyon (`verify-v71.cjs`: v64 listesi + v66–v71 paketleri, Chromium + WebKit) ve
  `verify-reliability.cjs` geçti (386 PASS). Eşlemeler: v70 paketi yazıcı kapalı başlar ve yeniden
  açılışta açık bekler; v69 paketi sınırı görüntü toplamıyla (96 MB) ölçer; v61'in satır içi PDF
  defterinde önbellekli/tam serileştirme süresini ölçen testinde yazıcı kapalıdır (ilk koşuda bu test,
  göçün kaydı birkaç saniye sonra anahtarlara çevirmesi yüzünden "disk = defter" iddiasında kaldı).
  Paket özeti (SHA256SUMS): `4e921191…`.
- `test_deploy_v71.py` (sahte Docker, 6 kontrol).
- Fiziksel iPad testi yapılmadı.

## Yayın

Kullanıcı onayıyla ("Evet, canlıya al") 2 Ekim 2026 akşamı canlıya alındı. Kaynak
`e065f969c63b3d4b5ef0110e6b2d65d684faf56e`, paket `5678ecc1…` (246 dosya), web SHA256SUMS `4e921191…`,
nginx `3f3ef2ae…` (değişmedi). PR #9 master'a alındı.

- **prepare:** canlı v70 web ve v68 hesap servisi doğrulandı; anlık görüntüler alındı.
- **stage:** önizleme (18800) 238/235/14/6, `healthy`.
- **rehearse:** v70 web kayıttan 18806'da kuruldu, 238/235/14/6, silindi.
- **activate:** web v71 238/235/14/6, `healthy`; hesap servisi v68 değişmedi; `-rollback-v71` (v70 web) durmuş halde.

**Bağımsız kontroller:** `current` → v71/ui; canlı `index.html`, `pdf-workspace.js`, `save-worker.js`,
`sync-workspace.js`, `sw.js`, `release.json` baytları `e065f96` ile aynı; sağlık betiği
`web v71 api v68: 15 kontrol`; genel adres Access girişine 302.

**Henüz yapılmadı:** fiziksel iPad kabulü. Öğrenci uygulamayı tamamen kapatıp açınca v71 iner; defter
açılıştan birkaç saniye sonra kendiliğinden göç eder.
