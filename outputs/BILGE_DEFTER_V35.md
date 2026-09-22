# Bilge Defter v35 — otomatik uçtan uca şifreli eşitleme

22 Eylül 2026. Eşitleme diliminin üçüncü adımı: oturum kilidiyle otomatik
eşitleme. Şifreleme ve kimlik altyapısı (v32/v33) üzerine kuruludur; sunucu
hâlâ yalnız şifreli yığın görür.

## Kullanım

- Davetli adreste Yedek penceresinde "Eşitlemeyi aç" düğmesi: parola girilir,
  parola sunucudaki yedekle doğrulanır, oturum boyunca eşitleme açılır.
  Parola hiçbir yerde saklanmaz; oturum kapanınca yeniden istenir.
- Açıkken her 5 saniyede bir denetlenir:
  - Cihaz temizse ve yerel değişiklik varsa → otomatik şifreli push.
  - Sunucuda daha yeni kopya varsa ve cihaz temizse → otomatik pull ve uygulama.
  - İki taraf da değiştiyse → çakışma bandı: "Sunucudakini yükle" /
    "Yereldekini gönder" / "Şimdilik bırak" (30 dk erteleme). Seçim size aittir;
    hiçbir şey sessizce ezilmez.
- Son eşitleme zamanı cihazda (localStorage) tutulur; not verisi değildir.
- Özel adreste eşitleme yoktur; düğme gizlenir ve nedeni açıklanır.

## Güvenlik ve dürüst sınırlar

- Push/pull yalnız oturum kilidi açıkken ve davetli adreste çalışır.
- Sunucu tek son kopya tutar; sürüm geçmişi yoktur. İki cihaz dönüşümlü
  kullanımda güvenlidir; aynı anda düzenlemede çakışma manuel seçilir.
- Çevrim dışı/404 durumları sessizce atlanır, sonraki denetim yeniden dener.
- Eşitleme JSON yedeğinin yerini tutmaz.

## Kapatılan kusur

- `keyFor` anahtar önbelleğini yalnız parolayla eşliyordu; farklı tuzla
  şifrelenmiş yedeklerde (başka cihazın push'u) yanlış anahtarla çözme
  deniyor ve çakışma "Sunucudakini yükle" sessizce başarısız oluyordu.
  Önbellek artık parola+tuz anahtarlı.

## Doğrulama

- 24 uygulama paketi, 245 kontrol: önceki tüm paketler + otomatik eşitleme
  paketi (6 kontrol): özel adreste gizlilik, kilit açma, otomatik şifreli
  push + zaman damgası, temiz cihazda otomatik pull, çakışmada yerel seçimi
  (push eder), çakışmada sunucu seçimi (uygular).
- Fixture paketleri geçti. Canlı: private v35 (rozet, sync-workspace.js).
- Fiziksel iki cihaz arası gerçek eşitleme kabulü kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 217 dosyalık v35 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v35-auto-sync` ve
`/opt/bilge-defter-invited/releases/20260921-v35-auto-sync`.

Yeni konteynerler: private `5d08fcbde4bbff36888ed9e6a38c7ec4021bc2bb089e021a561c922b8f828e5b`,
davetli `01f72640518ce5283deef5395cc3b61170cd4ff9bb1d6f6d6167f9ed8faca6a9`.
Öncekiler `rollback-before-v35` olarak saklandı. SHA256SUMS özeti:
`0d3b42720dda0f7c4e328ea0cbf844f620269322c6d28aef097222244c9c331b`.

## Sonraki dilim

Öneri: push bildirimi (hesap/eşitleme tamamlandığı için artık anlamlı) veya
el yazısı tanıma/Türkçe-tıbbi sözlük. Öncelik kullanıcı kabulüne göre.
