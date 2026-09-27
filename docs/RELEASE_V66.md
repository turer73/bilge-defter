# v66 — kayıt işlemcisi durunca defter kendini topluyor

27 Eylül 2026'da iPad'de ana ekran uygulamasıyla yapılan v65 kabul testinde, sürekli yazarken
**"Başka sekmede değişiklik var — yedek alın"** uyarısı çıktı ve düzenleme durdu. Açık başka
sekme yoktu.

## Neden

v60'tan beri defter, kaydı ayrı bir iş parçacığında (`save-worker.js`) yapıyor. Karşılaştırma
tabanı yalnızca bu işçide tutuluyor. İşçi herhangi bir nedenle hata verdiğinde ya da 60 saniye
yanıt vermediğinde sayfa bunu **başka sekme çakışması** olarak işaretliyordu. Gerçek neden
(`Kayıt işlemcisi durdu`) yalnız konsola yazılıyordu. Sonuç: yanlış uyarı, duran düzenleme ve
kaydedilmemiş son çizgiler.

Tetikleyiciler:

- **IndexedDB bağlantı kaybı.** İşçide `db.transaction` bir hata yakalayıcının dışındaydı.
  WebKit'in IndexedDB bağlantısını düşürdüğü biliniyor: uygulama arka planda kalınca ya da bellek
  baskısında depolama süreci kapatılınca. Bu durumda istisna işçi hatasına dönüşüyordu.
- **İşçi içindeki yakalanmamış istisnalar.** Örnek: büyük defterde bellek yetmezliği.
- **Yanıtsız işçi.** 60 saniyelik zaman aşımı.

Kullanıcının iPad'inde bunlardan hangisinin olduğu cihaz konsolu olmadan kanıtlanamadı.
Bağlantı kaybı Chromium ve WebKit'te birebir aynı ekranla yeniden üretildi.

## Düzeltme

- **İşçi.** Kopan bağlantıyı yeniden açıp adımı bir kez tekrarlıyor. Karşılaştırma tabanı işçide
  kaldığı için karşılaştırma eskisi kadar sıkı. Hiçbir hatayı fırlatmıyor, her hatayı gerçek
  adıyla yanıtlıyor. Diskteki kayıt zaten gönderilen metne eşitse (önceki deneme yazılmış ama
  yanıtı kaybolmuşsa) başarılı sayıyor.
- **Kayıt işaretçisi.** Her işçi kaydı aynı işlemde küçük bir işaretçi de yazıyor
  (`app-writer`): sayfanın yazar kimliği, kayıt numarası ve metin uzunluğu. İşçi durur ya da
  takılırsa yeni bir işçi yalnızca diskteki işaretçi bu sayfanın son yazdığı ya da yazmakta
  olduğu kayda aitse devam ediyor. Başka biri yazmışsa kayıt yine çakışma olarak reddediliyor ve
  üzerine yazılmıyor.
- **Eski kayıtlar.** v66 öncesinden kalan, işaretçisi olmayan kayıtlar açılıştaki uzunlukla
  tanınıyor.
- **Sayfanın kendi bağlantısı.** Sayfa da kopan bağlantısını yeniden açıyor: okuma, eşitleme
  onayı ve yedek yol.
- **Kurtarılamayan hata.** Gerçek kod gösteriliyor, örneğin `Ayrıntı: SaveWorkerLost.` Başka sekme
  uyarısı çıkmıyor ve "Yeniden dene" düğmesi açık kalıyor. Çakışmada da neden yazılıyor, örneğin
  `Ayrıntı: Kayıtlı defter bu sekmenin son kaydı değil.`
- **Kapsam.** Veri biçimi (`app` kaydı), yedek, eşitleme ve hesap servisi değişmedi. Hesap servisi
  v65'te kalıyor.

## Yerel doğrulama

- **`verify-v66-save-recovery.cjs` (yeni), 16 kontrol, Chromium ve WebKit:**
  - bağlantı kaybında aynı işçiyle her çizgi kaydediliyor;
  - duran işçinin yerine gelen işçi kaldığı yerden devam ediyor;
  - diske yazılmış ama yanıtsız kayıt tanınıyor;
  - yazmadan takılan işçi değiştiriliyor;
  - sayfanın bağlantısı yeniden açılıyor;
  - araya başka yazar girerse çakışma nedeniyle birlikte gösteriliyor;
  - işaretçisiz eski kayıt toparlanıyor;
  - işçi başlatılamazsa kod gösteriliyor ve "Yeniden dene" kaydediyor.
- **Negatif kontrol.** Aynı paket v65'e karşı ilk bağlantı kaybı senaryosunda kalıyor: kayıtlar
  duruyor.
- **`verify-v60-save.cjs` bilinçli değişikliği.** v60 testi "işçi hatasından sonra kayıt çakışma
  olarak durur" diyordu. v66 çalıştırıcısında bu beklenti "yeni işçi bu sekmenin son kaydından
  devam eder" oldu. Aynı pakette eski ikinci sekme hâlâ reddediliyor. 36 MB defter kaydı sayfayı
  42–47 ms bloklıyor (ana iş parçacığında 218–249 ms).
- **`test_deploy_v66.py`, 4 kontrol, sahte Docker:**
  - saklanan konteynerle geri dönüş;
  - silinmiş konteynerin kayıtlı yapılandırmadan v65 bağlamalarıyla yeniden kurulması;
  - yanlış kimlikte canlıya dokunmadan ret;
  - provanın 18806 portunda yapılıp silinmesi.
- **Tam regresyon.** Sonuçlar aşağıda, ["Regresyon"](#regresyon) bölümünde.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Geri dönüş konteyneri ve sunucu temizliği

27 Eylül 13:55'te klipper'daki linux-ai-server bellek düzeltmesi `docker system prune -f`
çalıştırdı. Durmuş bütün konteynerler, `rollback-v64` de dahil, silindi (disc#1905). v66
geri dönüşü bu yüzden artık konteynerin varlığına güvenmiyor:

- Konteyner silinmişse v65 web konteyneri hazırlıkta alınan kayıtlı yapılandırmadan yeniden
  kuruluyor.
- `rehearse` modu bu yeniden kurulumu canlıya dokunmadan 127.0.0.1:18806'da deniyor, v65
  doğrulayıcısıyla sınıyor ve siliyor.
- `activate` başarılı prova kanıtı olmadan çalışmıyor.

## Regresyon

- **Genel sonuç.** `verify-v66.cjs`, 20 paket. `verify-v61-save` dışındaki 19 paket ilk koşuda
  geçti. `verify-reliability.cjs` 26 kontrol geçti. v65 temel paketi Git'ten sabit hash'le
  (`59fcbef4…`) yeniden üretildi.
- **Sürüm güncellemesi.** v65 → v66 service-worker güncellemesi ve notların korunması iki motorda
  geçti (`verify-v59-update`, `verify-v47-update`).
- **Bilinen oynak ölçüm: `verify-v61-save` WebKit PDF.** Test, önbellekli kaydın tam kayda göre
  ana iş parçacığını en çok %75 oranında bloklamasını istiyor.
  - v66'da tam koşuda kaldı (48'e 48 ms). Tek başına iki koşuda da kaldı (51'e 63 ms, 47'ye 62 ms).
    Sonraki üç tekrarda geçti (31/62, 32/63, 31/63).
  - Aynı suite değişmemiş v65'te iki koşunun birinde kaldı (45'e 49 ms, sonra 30'a 62).
  - v66 önbellekli kaydın ana iş parçacığı yolunu değiştirmedi. Değişen yalnız işçi tarafı ve
    küçük bir işaretçi nesnesi. Test eşiği gevşetilmedi. Bu oynaklık ayrı bir iş olarak
    duruyor.

## Yayın

Kullanıcı onayıyla ("test bitince canlıya al") 27 Eylül 2026'da canlıya alındı. Künye:

| Alan | Değer |
|---|---|
| Kaynak commit | `d05c8636ca090690c480d78c394c7b49cc4dc2a9` |
| Paket `SHA256SUMS` | `fe5f5948…` |
| Payload | `ad9f5e4a…`, 246 dosya |
| nginx yapılandırması | `3f3ef2ae…`, v65 ile aynı |

**Yayın betiğinin kontrolleri:**

- **`stage`:** v66 ön izlemesi 127.0.0.1:18800'de doğrulandı: 238 HTTP hash, 235 çevrim dışı
  dosya, 14 yetkisiz istek reddi, 6 korumalı yol kapalı.
- **`rehearse`:** v65 web konteyneri kayıtlı yapılandırmadan 127.0.0.1:18806'da yeniden kuruldu.
  v65 doğrulayıcısından geçti (238 / 235 / 14 / 6), sonra silindi.
- **`activate`:** Canlıda aynı dört kontrol geçti. Kütüphane sağlıklı; hesap servisi (v65) ve
  diğer servisler değişmedi.

**Bağımsız kontroller:**

- `current`, `/opt/bilge-defter-classroom-v66/ui`'yi gösteriyor ve `release.json` v66.
- Canlıdaki `save-worker.js`, `index.html`, `sw.js`, `release.json` baytları Git'teki `d05c863`
  ile aynı.
- v65 web konteyneri `-rollback-v66` adıyla durdurulmuş halde bekliyor. Hesap konteyneri aynı
  kimlikte çalışıyor.
- İnternetten oturumsuz istek 302 ile Access girişine gidiyor.

**Henüz yapılmadı:**

- Fiziksel iPad ve gerçek hesap kabulü.
- GitHub'a push ve `master` birleştirmesi. v65'te eklenen Actions iş akışı nedeniyle önce kota
  kontrolü gerekiyor.

**Geri dönüş (yalnız v66 etkin sürümken).** Durmuş v65 konteyneri silinmişse geri dönüş onu
kayıtlı yapılandırmadan yeniden kurar:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v66/deploy-v66.py rollback
```
