# Tanınan cihaz ve hatırlanan eşitleme parolası

3 Kasım 2026 kararı: öğrenci bir cihazda bir kez giriş yapıp parolasını girdikten sonra
o cihazda tekrar tekrar sorulmasın. Yalnız gerçekten gerekli durumlarda sorulsun.

## Önceki durum (v80)

Üç ayrı soru vardı:

1. **Cloudflare Access e-posta kodu.** Uygulama oturumu `24h`. Her gün yeniden kod isteniyordu.
2. **Açılışta canlı hesap doğrulaması.** İnternet yoksa ya da Access oturumu düşmüşse defter
   kapı ekranında kalıyordu. Önceki kural: "doğrulanmamış önbellek kimliğiyle defter açma".
3. **Eşitleme parolası.** Yalnız bellekte tutuluyordu. Her açılışta "Eşitlemeyi aç", her elle
   yedeklemede ve geri yüklemede yeniden soruluyordu.

## Yeni davranış

**Tanınan cihaz** (`account-workspace.js`): Canlı ve onaylı her doğrulama bu tarayıcı profiline
`bilge-defter-trusted-device-v1` kaydını yazar (hesap kimliği, e-posta, rol, zaman). Kayıt 30 gün
geçerlidir ve her doğrulamada yenilenir. Açılışta doğrulama ağ hatası, 5xx ya da 401 (oturum düşmüş)
ile başarısız olursa aynı hesabın yerel defteri açılır. Sol altta bir bildirim görünür: oturum
düştüyse "Girişi yenile" bağlantısıyla, ağ yoksa bağlantı uyarısıyla. Sunucuya giden her istek yine
canlı doğrulama ister. Giriş yenilenince aynı pencerede devam edilir.

Kayıt şu durumlarda silinir:
- çıkış yapılınca,
- sunucu başka bir hesap ya da onaylı olmayan bir durum (askı, ret, bekleme) bildirince,
- 30 gün dolunca.

Hiç doğrulanmamış yeni cihaz eskisi gibi kapalı kalır.

**Hatırlanan parola** (`sync-workspace.js`): Parola diyaloğunda "Bu cihazda hatırla" kutusu
varsayılan olarak işaretlidir. Parolanın kendisi hiçbir yerde saklanmaz. Parola bir kez
dışa aktarılamayan (`extractable:false`) bir PBKDF2 anahtarı olarak içe aktarılır ve yalnız bu
`CryptoKey`, `bilge-defter-device-trust` IndexedDB'sinde hesap kimliği altında saklanır. Sayfa bu
anahtarla yedek anahtarı türetebilir, ama parolayı okuyamaz ve anahtarı dışa aktaramaz. Açılışta eşitleme diyalog açılmadan kendiliğinden açılır. "Sunucuya yedekle",
"Sunucudan yükle" ve "Önceki sunucu kopyası" artık parola sormaz.

Parola yalnız şu durumlarda yeniden sorulur:
- sunucudaki kopya kayıtlı parolayla açılmazsa (parola başka cihazda değişmiş demektir; kayıt
  silinir ve bir kez sorulur),
- "Bu cihazdaki kayıtlı parolayı sil" seçilince,
- çıkış yapılınca,
- 180 gün hiç kullanılmayınca.

Önceki sunucu kopyası kayıtlı parolayla açılmazsa kayıt silinmez. O kopya eski bir parolayla
şifrelenmiş olabilir; parola bir kez sorulur.

Hatırlama yalnız doğrulanmış bir hesaba bağlıdır. Hesapsız yerel modda (özel adres, eski
testler) davranış v80 ile aynıdır.

## Güvenlik değerlendirmesi

Defterin kendisi bu cihazda zaten açık metin olarak IndexedDB'de duruyor. Bu yüzden hatırlanan
parola ve önbellek kimliği, cihaza erişen birine yerel verinin ötesinde yeni bir şey açmaz.
Sunucu tarafı değişmedi: yedek uçları yine doğrulanmış Access JWT'si ve hesap onayı ister.
Sayfada çalışan kötü amaçlı bir betik saklanan anahtarla sunucu yedeğini açabilir, ama parolanın
metnini elde edemez. Aynı betik parolayı yazılırken de okuyabilirdi; bu risk v80'de de vardı. Ortak cihazda
kullanıcı çıkış yapmalı. Giriş ekranındaki yardım metni bunu söyler.

## Cloudflare tarafı

Access uygulaması "Bilge Defter - Davetli" (`ad7dea78-…`) için oturum süresi `24h` idi.
Sunucudaki token kasıtlı olarak yalnız politika yazabiliyor; uygulamaya yapılan `PUT` isteği
`auth.forbidden` döndü. Ayar 3 Kasım 2026'da kullanıcı tarafından panelden **1 month** yapıldı.
Canlıda okunan değer `730h`; audience, kimlik sağlayıcı, politika kimliği ve 2 e-postalık liste
değişmedi. Bu tarihten önce açılmış oturumlar kendi süreleri (24 saat) dolunca biter; sonraki
girişler ayda bir kod ister. Arada oturum düşerse tanınan cihaz defteri yine açar; yalnız
eşitleme için giriş istenir.

## Doğrulama

`npm run test:device-trust` gerçek hesap API'sine karşı Chromium ve WebKit'te çalışır
(`browser_server.py`, sentetik Access çerezi, yalnız loopback). Her motorda 13 senaryo vardır. Mutasyon denetimi yapıldı: `trusted()` sabit
`null` döndürünce ikinci senaryo, `recallPass()` sabit `null` döndürünce dokuzuncu senaryo düşüyor.
Fiziksel cihaz ve gerçek e-posta ile kabul yapılmadı.

Tarihsel `verify-v51-login.cjs` süiti önce onaylı bir hesapla giriş yapıyor, ardından oturumu
düşmüş, ağı kesilmiş ve sunucusu hata veren açılışları sınıyor. v81'de bu cihaz artık tanındığı
için defter açılır, bu yüzden süit ilk koşuda düştü (beklenen davranış farkı). Süit tanınmamış
cihaz sözleşmesini sınamaya devam etsin diye bu üç açılıştan önce
`bilge-defter-trusted-device-v1` kaydı siliniyor. v81 öncesi sürümlerde bu adım etkisizdir.

`verify-import-recovery-sync.cjs` iki gerçek sorunu yakaladı ve ikisi de düzeltildi:
1. İlk tasarım parolayı `subtle.encrypt` ile şifreleyip saklıyordu. Testin şifreleme bariyerini
   bu çağrı tüketiyordu; bu, PBKDF2 anahtarı saklama tasarımına geçişi tetikledi.
2. Açılıştaki otomatik kilit açma ortak işlem kilidini tutuyordu. Bu sırada basılan "Sunucuya
   yedekle" sessizce yok sayılıyordu; WebKit'te IndexedDB yavaş açıldığı için görünür oldu.
   Otomatik açma defteri değiştirmediği için artık kilit almıyor.
