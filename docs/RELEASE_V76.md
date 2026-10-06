# v76 — doğrudan PowerPoint pilotunun web yayını

Bu belge yayın **prosedürüdür**, canlıya çıkıldığına ilişkin kanıt değildir.
Canlı sonuç yalnız aynı kaynak commit'i ve receipt'e bağlı `live-proof.json`
üretildiğinde yazılır. Gerçek iPad kabulü bundan ayrıca raporlanır.

## Dar kapsam

- Yalnız `bilge-defter-invited-web` ve `current` statik arayüz işaretçisi değişir.
- Yeni kök: `/opt/bilge-defter-classroom-v76`; önceki kök v75'tir.
- Accounts API, kütüphane, v73 PowerPoint dönüştürme işçisi, kimlik doğrulama,
  Cloudflare/Tailscale ayarları ve sunucu veritabanları değişmez.
- Mevcut `minimum-reader.json` (v75 yayını / minimum v74 okuyucu) **aynen kalır**.
  Bu araç eski işaretçiyi başka sürüme bağlamaz ve azaltmaz.
- Bu yayının geri dönüşü yalnız v75 web'dir. `deploy-v75.py rollback` **kullanılmaz**;
  o komutun kapsamı web ile sınırlı değildir.
- Paket öğrenci sunumu, çizimi, özel tarayıcı deposu veya özel anahtar içermez.
  Öğrencinin PPTX dosyası yeni istemci okuyucusunda işlenir; eski sunucu PDF
  dönüştürme yolu bu yayın nedeniyle yeniden yapılandırılmaz.
- Web konteynerinin canlı v75'te ölçülen capability düzeni korunur: `CapDrop=ALL`
  ve yalnız `CAP_CHOWN`, `CAP_SETGID`, `CAP_SETUID`. Araç ek/eksik/tekrarlı
  capability'yi reddeder; yeni web aynı üçünü alır. Bu bir yetki genişletmesi
  değildir. Salt okunur kök, `no-new-privileges`, mevcut ağ ve iki salt okunur
  bind mount zorunlulukları değişmez.

Ürün davranışı ve pilot sınırları için [DIRECT_PPTX_PILOT.md](DIRECT_PPTX_PILOT.md).
Pilotun tarayıcı testleri, gerçek iPad kalem/avuç/bellek ve font sadakati kabulünün
yerine geçmez. Ana defter verisiyle ve ayrı PPTX yedeğiyle neyin taşındığı arayüzde
açıkça belirtilmelidir; yalnız aynı hesapla oturum açılması cihazlar arası sunum
eşitlemesi anlamına gelmez.

## Yayımlanan yeni dosyalar

Yalnız `/pptx-workspace.js` ve şu tam yollar nginx'e eklenir:

```
/pptx/host.js
/pptx/host.css
/pptx/model.js
/pptx/store.js
/pptx/renderer-bridge.js
/pptx/renderer-frame.html
/pptx/NOTICES.txt
```

`/pptx/` için genel dizin izni verilmez. Kaynak `renderer-frame.js`, bağımsız
runtime/vendor dosyaları, provenance, testler ve yerel pilot index'i yayımlanmaz.
`NOTICES.txt` gerekli üçüncü taraf lisanslarını içerir.

Ana pencere frame HTML'ini aynı origin'den (kuruluysa SW önbelleğinden) alır;
4 MiB sınırı ve sabit SHA-256 eşleşmesi geçmeden iframe'e belge koymaz.
Doğrulanmış belge `srcdoc` olarak, yalnız `allow-scripts` ile sandbox içinde ve
`allow-same-origin` olmadan çalışır. Kendi içinde iki klasik
inline betik bulunur. CSP yalnız bu iki betiğin SHA-256 değerlerine izin verir;
ağ/worker/alt-frame/object/form erişimleri kapalıdır. Frame'in HTML meta CSP'si,
committed provenance ve gerçek betik baytları builder'da birlikte doğrulanır.
Etkin çocuk politikası HTML meta CSP'sidir; nginx doğrudan belge isteğine de
aynı CSP'yi HTTP başlığı olarak gönderir. Yerel pilot ana sayfası srcdoc'a
miras kalması için yalnız aynı iki hash'e ve kendi betiklerine izin verir.
Başlangıç anahtarı iframe adındaki rastgele doğrulama değeridir; hesap veya
defter bilgisi çerçeveye gönderilmez. Kilit/çıkış bekleyen frame indirmesini
iptal eder. Bu location'da başlık
kalıtımı kalktığı için `nosniff`, `no-referrer` ve `private, no-store,
no-transform` başlıkları tekrar belirtilir.

`work/classroom-nginx.conf` değiştirilmez. Builder v75 şablonuna yalnız işaretli
tam yol bloğunu ekler. Bu bloğun çıkarılmasıyla oluşan baytların önceki nginx
dosyasıyla aynı olması hem builder'da hem sunucuda zorunludur; Access/API/proxy,
yükleme sınırı ve rate-limit blokları korunur.

## Yerel hazırlık

1. Aktif CLAIM, dal, HEAD ve değişiklik kapsamını doğrula; bağımsız inceleme ve
   hesap/çevrimdışı/PPTX kabul testlerini tamamla.
2. `node work/build-invited.cjs` ile sürümü **v76** olan paket ve manifestleri
   üret. `work/bilge-defter-test/pptx` içinde yalnız yedi dosya bulunmalı.
3. `python -B work/test_deploy_v76.py` çalıştır. Testler Docker'a veya ağa
   bağlanmaz; gövdeli paket, dar nginx eki, CSP, özel env dosyası, başarısız
   stage, yarım activation ve yanlış kimlikle rollback kontrollerini ölçer.
4. İncelenmiş uygulama, üretilmiş kaynak manifesti, pilot/provenance, yayın
   araçları ve belgeleri commit et. Builder kapsamda dirty/untracked kaynak
   bulunduğunda durur; kayda alınmamış işi canlıya paketlemez.
5. `python -B work/build-release-v76.py` çalıştır. Çıktı:
   `outputs/direct-pptx-release-v76/package/`.

Builder her UI dosyasını hem SHA256SUMS ile hem o commit'teki Git blob'u ile
eşleştirir. Offline manifestteki yeni dosyalar ayrıca kontrol edilir. Tar payload
deterministiktir (sabit sıralama, izin, mtime ve gzip mtime). Var olan payload
üzerine yazılmaz; yeniden üretmek gerekiyorsa önce çıktıyı koruyup farklı boş
çıktı konumu kullanın. Payload özeti ile kaynak receipt'i sonradan karıştırmayın.

## Sunucuda sıralama — yalnız yetkili ana oturum

Alt ajanlar uzak komut yürütmez. Ana oturum hemen önce gerçek durum ve port
uygunluğunu salt okunur ölçer. v75 current/manifests/web image ve mevcut
minimum-reader işaretçisi beklenenden farklıysa ilerlemez.

Yeni v76 kökünü oluşturup payload, source-receipt ve bootstrap `deploy-v76.py`
dosyalarını kopyala; taşınan payload ve bootstrap hash'lerini yerel kaynakla
eşleştir. Kök daha önce kullanılmışsa üzerine yazma. Sonra:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v76/deploy-v76.py prepare
```

`prepare` tar yol/bağlantı/tekillik/dosya-kümesi ve paket hash'lerini doğrular;
yeni `private/` dizinini 0700, özel dosyaları 0600 yapar. Mevcut web inspect'i,
diğer konteynerlerin kimlik/config/mount/start parmakizleri, sunucu ana PID'si
ve reader-floor hash'i korunur. v75 statik web dosyaları ve nginx bir tar yedeğine
alınır. **Hiçbir öğrenci veritabanı açılmaz, kopyalanmaz veya geri yüklenmez.**

`private/` altındaki şu dosyaları erişimi sınırlı bilgisayar yedek dizinine al:

```
prior-web.tar.gz
web.json
protected.json
backup-receipt.json
```

Docker inspect özel bilgi içerebilir; terminale, Git'e veya genel çıktıya basma.
İlk üç dosyanın SHA-256 değerlerini `backup-receipt.json` ile bilgisayarda
doğrula. Doğrulamadan sonra receipt'in aynı baytlarını sunucu kökündeki
`offhost-backups.json` olarak bırak. Bu kanıt olmadan stage/activate başlamaz.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v76/deploy-v76.py stage
```

Stage yalnız yeni `bilge-defter-invited-web-preview-v76` konteynerini
`127.0.0.1:18807` üzerinde açar. Mevcut API/kütüphane adreslerini değiştirmez;
doğrulayıcı yalnız statik GET ve kimliksiz/sahte kimlikli reddedilme GET'leri yapar.
Başarısız stage üretim web'ini durdurmaz, yalnız kendi kimliği kanıtlanmış
preview'ını durdurur ve kanıtı saklar. Başarısız stage'i körlemesine tekrarlamayın;
artık konteyner/kanıt dosyalarını önce inceleyin.

Bağımsız hash/head ve tarayıcı kapıları geçince:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v76/deploy-v76.py activate
sudo python3 -B /opt/bilge-defter-classroom-v76/deploy-v76.py verify
```

Activate önce preview/body/proof kimliklerini ve yedekleri yeniden doğrular.
Eski web durdurulur ve `bilge-defter-invited-web-rollback-v76` adıyla korunur.
Yeni web aynı image, env, ağ, loopback portu ve güvenlik/resource ayarlarıyla,
yalnız yeni statik mount'larla oluşturulur. Docker ID kanıtı start'tan önce
yazılır. Sağlık, bütün HTTP gövde hash'leri, offline dosyaları, dar frame CSP,
401 kapıları ve özel dosyaların 404'ü doğrulanır. Sonra current atomik değiştirilir.
API/kütüphane/worker/diğer servis parmakizleri ve reader-floor aynı kalmalıdır.
Preview durdurulur; silinmez. Kanıt `live-proof.json` olur.

Herhangi bir kesinti, başarılı yayın veya gerçek cihaz kabulü değildir.
`activation-started.json` ikinci activation'ı engeller; kısmi durum için recovery
kullanılır. Araç başarısızlıkta yalnız kimlikleri doğrulanmış kendi yeni web'ini
geri alır. Kimlik belirsizse hiçbir yabancı konteyneri durdurmadan durur.

## Geri alma

```sh
sudo python3 -B /opt/bilge-defter-classroom-v76/deploy-v76.py rollback
```

Önce kaynak receipt'i ile bilgisayarda doğrulanmış özel yedeklerin bağı,
current'ın v75/v76 olduğu, tutulan v75 web ID'si, yeni web ID'sinin created
receipt'i, korunmuş v75 dosyaları ve mevcut reader-floor kontrol edilir.
**Aday v76 dosyalarının sağlamlığı veya başka bir servisin yeniden başlamamış
olması geri alma önkoşulu değildir:** geri almaya ihtiyaç duyulmasının sebebi
bunlar olabilir. Diğer servislerdeki farklar yalnız ad ve değişen alan
etiketleriyle, sırları göstermeden önce/sonra raporlanır; yalnız kendimize ait
web'i kurtarmayı engellemez. Sonra yalnız v76 web durdurulup `-failed-v76` adıyla saklanır; eski web
aynı ID ile yeniden başlatılır, current v75'e döner ve gövde testleri çalışır.
Bu gövde testleri deploy kodunun içindedir; bozulmuş olabilecek aday v76
doğrulayıcı dosyasını çalıştırmaz. v75 geri konmuş fakat HTTP doğrulaması
başarısızsa kanıt bunu ayrı belirtir ve komut başarısız sonuç verir.
Yeni veya tutulan web kimliği bilinmiyorsa, tutulan web kayıpsa ya da `-failed-v76`
zaten varsa araç otomatik veri/servis kurtarma uydurmaz; inceleme ister.

Eski DB kopyası geri yüklenmez. API, worker, kütüphane ve mevcut minimum-reader
işaretçisine dokunulmaz. v76'nın ayrı yerel PPTX deposu v75 tarafından açılmasa
da silinmez; öğrencinin ana defteri bundan bağımsız korunur. Öğrenci testinden
önce ana defter JSON yedeği ve varsa ayrı PPTX pilot yedeği alınmalıdır.

## Yayın sonrası kabul

- Gerçek davetli HTTPS origin'de giriş ve Ekle menüsü; eski sekme/cache sürümü.
- iPad'de izinli gerçek sunumu seçme, slayt ilerletme, kalem/avuç, not kaydı,
  kapatıp yeniden açma ve sunum+not yedeğinden ayrı kopyaya geri dönme.
- Uygulamanın sunduğu deftere ekleme işleminin kaynak/asıl notları koruması;
  ders defteri açıp yedek sonrası tekrar doğrulama.
- Hazırlanmış offline pakette okuyucunun açılması; hesap yeniden doğrulama
  politikasının değişmeden kalması. Giriş kapısı çevrimdışı atlanmamalı.
- Aynı cihazda farklı hesapların sunum listesi/notlarını görmemesi; hesap kilidi
  ve çıkışın açık okuyucuyu kapatması.
- Büyük sunum belleği, özel grafik/font/EMF görünümü, kesintili kayıt ve düşük
  depolama sonuçları gerçek cihazdan değerlendirilir. Başarı yalnız masaüstü
  emülasyonuna dayanarak yazılmaz.

## CSP dayanakları

[MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
ve [script-src hash politikası](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
