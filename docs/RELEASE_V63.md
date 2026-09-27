# v63 — çizgili kâğıt seçimi, tam yüzey odak görünümü, ayrı kalem ve vurgulayıcı renkleri, takılmasız iki parmak kaydırma

Kullanıcı 27 Eylül 2026'da v62 canlıya alındıktan sonra dört şey bildirdi: çizgili kâğıt
seçilemiyor ve çizgiler kayıyordu; odak modunda yazı alanı sayfayı kaplamalı; vurgulayıcı ve
kalem renkleri ayrı seçilmeli; iki parmak kaydırmada hâlâ hafif takılma var. İlk hazırlanan v63
(`4d1ea48`, paket cf2496dc) önizlemeye alındı ama kaydırma bildirimi üzerine yayınlanmadı; bu
sürüm onun yerine geçer.

## İki parmak kaydırmada takılma

Ölçüm (36 MB defter, 1200 çizgili etkin sayfa, 12 s art arda kaydırma): her kaydırmanın sonunda
kayıt çalışıyordu (Chromium 18, WebKit 10 kez); her kayıt ana iş parçacığında ~20 ms defter metni
kuruyordu ve en kötü kareler tam bu anlara denk geliyordu (WebKit 76–97 ms, Chromium 33–50 ms).
Çizim kareleri 2 ms altındaydı, yani takılmanın kaynağı çizim değil kayıttı. Kaydırma ayrıca
sayfanın "son düzenleme" zamanını değiştiriyor ve sayfanın kayıt önbelleğini geçersiz kılıyordu.

Artık kaydırma ve PDF sıkıştırma yakınlaştırması bir düzenleme sayılmaz: "son düzenleme" değişmez;
görünüm hareket durduktan 1,5 s sonra bir kez kaydedilir, parmak/kalem sürdükçe ertelenir.
Sayfadan çıkışta kayıt eskisi gibi hemen yapılır; kalemle yazılan çizgi kaydırma sürse de
kaydedilir. Sonuç: 12 s kaydırmada kayıt 0; Chromium en kötü kare 50 → 16,8 ms, WebKit 97 → 55 ms
(başsız WebKit bu makinede boşta da ~30 kare/sn, medyan 34 ms).

## Çizgili kâğıt seçilemiyordu

Yeni arayüzün kâğıt paneli çizgili deseni `ruled` adıyla gönderiyor, defter motoru ise yalnız
`lined` kabul ediyordu. "Çizgili"ye dokunmak sessizce reddediliyor, kareli/noktalı/çizgisizden
çizgiliye dönülemiyor ve çizgili düğmesi hiç seçili görünmüyordu (panel açılınca hiçbir desen
seçili değildi). Köprü (`ui-v2-bridge.js`) artık iki adı birbirine çeviriyor; kayıt biçimi
değişmedi (motor yine `lined` saklar).

## "Çizgiler kayıyordu"

Kullanıcı bunu "çizgiler yazıyla hizasız kayıyor" olarak netleştirdi. Ölçüm: v60'ta başka bir
ekranda yazılıp dar ekranda genişliğe sığdırılan sayfalarda yazı küçülüyor ama çizgiler 32 piksel
sabit kalıyordu; 10 satırda 210–256 piksel açılıyor, kaydırınca çizgiler yazının altından
kayıyordu. v61'de çizgiler yazıyla birlikte ölçeklendiği için canlıdaki v62'de fark her durumda
0 (kaydırma, sığdırılmış sayfa, %200). Kod değişikliği gerekmedi; eksik olan bu hizayı koruyan
testti, v63'te eklendi.

## Odak görünümü yazı alanının tamamını kaplıyor

Odak modunda kâğıt 840 piksel en fazla genişlikte, 20/24 piksel iç boşluklu, çerçeveli ve
yuvarlak köşeli kalıyordu (1180 piksellik ekranda 840 piksel). Odak sınıfı arayüzün gölge
DOM'unda olduğu için köprü onu `<html class="bd-focus">` olarak yansıtıyor; bu sınıfla kâğıt
dolgusuz, çerçevesiz ve sınırsız genişlikte: 1180×820 ekranda 1180×648, iPad dikeyde 820×1010,
yani editör alanının tamamı. Araç çubuğu, odaktan çıkış ve yakınlaştırma çubuğu yerinde kalır.
Kanvas `ResizeObserver` ile yeniden ölçülür.

Bilinen sonuç: odakta normal genişliği aşan yere yazılan not, odaktan çıkınca sayfa genişliğine
sığdırılır (küçük görünür); tekrar odağa girince tam boyutuna döner. Veri değişmez.

## Kalem ve vurgulayıcı renkleri ayrı

Önceden iki araç tek renk kutusunu paylaşıyordu; vurgulayıcı kalemin rengini yarı saydam
kullanıyordu. Artık her araç kendi rengini tutar (kalem #173b36, vurgulayıcı varsayılan sarı
#f5c400); araç değişince renk kutusu o aracın rengini gösterir, silgiden geçmek iki rengi de
korur. Metin kutusu ve el yazısı tanıma ile eklenen metin, vurgulayıcı seçiliyken bile kalem
rengini kullanır. Renkler, kalınlıklar gibi oturum boyunca tutulur.

Kütüphane, hesap servisi, veritabanları, kayıt biçimi, nginx izin listesi ve dosya sayısı
(238/235) değişmez.

## Yerel doğrulama

- `verify-v63-paper.cjs`, Chromium ve WebKit, 390 ve 1180 px, **24 kontrol**: çizgili varsayılan
  seçili görünüyor; kareliden çizgiliye dönülüyor ve `lined` saklanıyor; motor adları köprüden
  hâlâ çalışıyor; yeniden yüklemede kalıyor; çizgiler kaydırmada, sığdırılmış sayfada ve %200'de
  sayfa satırlarının tam üstünde; odak görünümü editör alanını kaplıyor ve kalem uç kenarda
  doğru yere düşüyor; odaktan çıkınca çerçeve dönüyor ve geniş yazı sığdırılıyor.
- `verify-v63-ink.cjs`, Chromium ve WebKit, **8 kontrol**: renklerin ayrılığı, çizgilerin kendi
  aracının rengini tutması, silgiden geçiş, vurgulayıcı seçiliyken metnin kalem rengi.
- `verify-v63-scroll.cjs`, Chromium ve WebKit, **6 kontrol**: 6 s kaydırmada kayıt yok; görünüm
  durunca tam bir kez kaydediliyor ve sayfa "düzenlendi" damgası almıyor; kaydırmadan hemen önce
  yazılan çizgi kaydırma sürerken kaydediliyor.
- Negatif kontrol: üç test canlıdaki v62 paketinde davranış noktasında başarısız (çizgili seçili
  değil; vurgulayıcı kalemin rengini gösteriyor; kaydırma sırasında 7 kayıt).
- `npm test`: 19 suite geçti (267 s); v51, v52, v56–v62 temel paketleri Git'ten sabit hash'lerle yeniden
  üretildi (v62 = canlıdaki 3592843a). Paket `SHA256SUMS` d592864d….
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

Kullanıcı onayıyla ("test bitince canlıya al") 27 Eylül 2026'da canlıya alındı (kaynak `9023acd`,
paket `SHA256SUMS` d592864d…, payload 616cb0ea…, nginx 3f3ef2ae… v62 ile aynı).

- Önceki, yayınlanmamış v63 önizlemesi (`4d1ea48`) silinmedi: konteyner
  `-preview-v63-unreleased-4d1ea48` adıyla durduruldu, dizini
  `/opt/bilge-defter-classroom-v63-unreleased-4d1ea48` altına taşındı.
- `stage` ve `activate`: 238 HTTP hash, 235 çevrim dışı dosya, 14 yetkisiz istek reddi, 6 özel
  yol kapalı; kütüphane `v58/library` kodunda ve sağlıklı; hesaplar ve diğer servisler değişmedi.
- Bağımsız kontrol: canlı `release.json` = v63; `index.html`, `ui-v2-bridge.js`,
  `media-workspace.js`, `ocr-workspace.js`, `sw.js` baytları Git'teki `9023acd` ile aynı; `verify`
  yeniden geçti; v62 web konteyneri `-rollback-v63` adıyla durdurulmuş saklanıyor.

Geri dönüş (yalnız v63 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v63/deploy-v63.py rollback
```
