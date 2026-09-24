# Bilge Defter v49 — öğrenci hesabı ve eşitleme adayı

23 Eylül 2026. **Güncelleme:** izole Linux hesap servisi ve otomatik giriş izni eşitleme kodu hazırlandı, gerçek üretim bağımlılıklarıyla test edildi. Genel adres hâlâ v46; yeni dar anahtar ve canlı kabul adımları bekliyor. En güncel kanıt: [Canlı geçiş durumu](BILGE_DEFTER_V49_CANLI_GECIS.md). Aşağıdaki 97 test/hash bilgisi önceki yerel dilimin tarihsel kaydıdır; son paket 115 kontrolle ayrıca doğrulandı.

## Kullanıcının seçtiği akış

Son karar: **48 öğrenci + 2 yönetici, ücretsiz sınır, öğrencileri yönetici ekranından sonradan tek tek e-postayla ekleme.** Önceki herkese açık başvuru kararı bu sınıf kurulumu için değiştirildi.

Yönetici e-postayı ekler → uygulama onayı verir → onaylı adres Cloudflare izin listesine ayrıca uygulanır → öğrenci e-posta koduyla doğrulanır → kişisel defter açılır. Son dış izin adımı bu yerel adayda otomatik değildir ve canlıda uygulanmadı.

E-posta kodu mevcut Cloudflare Access altyapısından alınacak. Uygulama kendi OTP kodunu üretmez/göndermez veya parola hesabı oluşturmaz. Cloudflare'da mevcut dar izin listesi bu turda genişletilmedi. Kayıt olmak otomatik erişim sağlamaz; Access kimliği ile uygulama onayı iki ayrı kapıdır.

## Uygulananlar

- Sunucu adayı: `D:/Projelerim/bilge-defter/server-candidate/v49/app/api/` altında üç modül. Canlı kaynak SHA-256 ve HEAD bilgisi `SOURCE.md` içinde. GitHub klonu değil, kontrollü dosya kopyasıdır.
- İstemci adayı: `D:/Projelerim/bilge-defter/work/bilge-defter-invited-v49`.
- Başvuru durumları: unregistered / pending / approved / rejected / suspended. Tekrar başvurmak ret veya askıya alma durumunu sıfırlamaz. İlk kayıt olan yönetici yapılmaz.
- Yöneticiler yalnız `BILGE_DEFTER_ADMIN_EMAILS` ortam ayarıyla tanımlanır. Ayar yoksa sistem erişimi kapalı tutar. Kullanıcı iki yöneticiyi seçti: **turgut.urer@gmail.com**, **sevdilurer@gmail.com**. Yerel `.env.classroom.example` hazırlandı; canlı servis ortamına uygulanmadı. Testlerde gerçek e-posta oturumu yerine yalnız sentetik adresler kullanılır.
- Yönetici ekranı: Ayarlar → Uygulama kurulumu → Hesabım ve sınıf. Liste, onayla, reddet, askıya al; 100 kayıtlık sayfalama. Hesap e-postası ve erişim durumu görünür, öğrenci notları gösterilmez. Kararlar ayrı denetim tablosuna yazılır.
- Yeni **Öğrenci e-postası → Öğrenci ekle** formu yalnız yöneticilere görünür. E-posta boşluk/büyük harf normalizasyonu yapılır; tekrar eklemek ikinci kayıt veya kontenjan oluşturmaz ve ret/askıya alma durumunu sıfırlamaz. Form e-posta göndermez.
- Varsayılan ve sınıf örneği kayıt modu `invitation`: listede olmayan öğrenci kendiliğinden kayıt olamaz. Eski `application` modu test ve uyumluluk amacıyla ayrı durur; ücretsiz sınıf kurulumu bu moda alınmaz.
- En fazla 48 kayıtlı öğrenci sınırı atomik işlemle uygulanır. Bekleyen, reddedilen ve askıya alınan adresler de listedeki yerini korur; askıya almak Cloudflare koltuğunu boşalttı sayılmaz. Eşzamanlı iki yöneticinin son yere ekleme yapması sınırı aşamaz.
- **Onaylı giriş listesini indir** yalnız onaylı öğrenciler + iki yapılandırılmış yöneticiyi metin dosyasına aktarır; bekleyen/ret/askıdaki öğrencileri dışarıda bırakır. Cloudflare politikasını, mevcut oturumları veya koltukları değiştirmez. Henüz otomatik giriş izni eşitlemesi yoktur.
- JWT imzası, issuer, audience, expiry, subject ve e-posta biçimi doğrulanır. Öğrenci rolü kullanıcı formundan alınmaz. Değiştiren istekler tam Origin + özel istek başlığı ister. Korunmuş tüm uçlar onay ve hesaba bağlanan başlık ister.
- Her onaylı hesabın rastgele kimliğiyle ayrı IndexedDB alanı açılır. Önceki genel defter kendiliğinden herhangi bir öğrenciye atanmaz. Hesap değiştiğinde eski açık pencere kilitlenir; çıkış diğer sekmelere de bildirilir. Şifreleme anahtar önbelleği ve otomatik eşitleme oturumu kilitte temizlenir.
- Yedek GET/POST: `cas-v1`, güçlü ETag, ilk yazıda `If-None-Match: *`, güncellemede `If-Match`. Kontrol ve yazı SQLite `BEGIN IMMEDIATE` içinde atomiktir. Eski sürüm 412, koşulsuz yazı 428 alır. Önceki şifreli yedekler silinmez; eski kayıttan başlangıç ETag'i hesaplanır.
- Eski push kayıt kodu yalnız HTTPS önekine bakarak kullanıcıdan adres kabul ediyordu. Öğrenci kitlesine açılacak adayda bu yol güvenli kabul edilmedi: kayıt/anahtar uçları 503 döner, gönderim yapılmaz. Açık uygulama periyodik eşitlemesi korunur. Bildirimler için ayrı adres doğrulama ve kötüye kullanım çalışması gerekir.

## Test kanıtı

| Kontrol | Sonuç | Sınır |
|---|---|---|
| Sunucu yetkilendirme, kontenjan, elle kayıt ve CAS | 47/47 | Gerçek yerel FastAPI, RSA JWT ve SQLite; ana sunucunun config/DB fabrikası yerine test adaptörü |
| Tarayıcıdan gerçek yerel API | 13/13 | Başvuru, menüden onay, şifreli gönderim, eski sürüm reddi, aynı profilde hesap ayrımı, askıya alma, çıkış; sentetik kimlik çerezi |
| Davetli modda elle ekleme | 8/8 | Gerçek form, tekrar ekleme, onay, izinsiz kaydın reddi, liste indirme ve 390 px görünüm; sentetik kimlik |
| Kayıt/PDF/OCR/PWA regresyonu | 29/29 | Çoğu API taklitli; gerçek Chromium çevrimdışı kurulumu özel/test adresi davranışını sınar |
| Paket dosya bütünlüğü | 228/228 | Son v49 paketi |

Son adayda bu dört paket yeniden çalıştırıldı: toplam **97/97**. Tam eski regresyon paketi, fiziksel cihaz, gerçek OTP teslimi ve kullanıcının kurulu masaüstü profili denenmedi. Teste özel `tests/browser_server.py` yalnız loopback ve geçici veritabanıyla çalışır; **asla dağıtılmaz**. Sentetik kimlik oluşturma yolu üretim modüllerinde yoktur.

İki ayrı yönetici kayıtları yönetebilir; birbirlerinin yapılandırılmış yetkisini öğrenci yönetimi ekranından kaldıramaz. Üçüncü yönetici veya 48 üzeri öğrenci sınırı yapılandırması erişimi kapalı tutar. Gerçek Cloudflare toplam koltuk sayısı ölçülmedi; arayüz bunu doğrulanmış göstermez.

Son istemci SHA256SUMS dosyası SHA-256: `d435be6eb0d0166247c965bb2341f7285c7ace8409cb20f4bd973aafac422a08`.

- [Başvuru bekleme ekranı](bilge-defter-v49-onay-bekliyor.png)
- [Yönetici ekranı](bilge-defter-v49-yonetici.png)
- [Elle öğrenci ekleme](bilge-defter-v49-elle-ekleme.png)
- [Dar ekranda elle ekleme](bilge-defter-v49-elle-ekleme-mobil.png)
- [Dar ekran hesabı](bilge-defter-v49-hesap-mobil.png)

Test kurulurken ilk yama biçimi hatalıydı; uygulanmadı, düzeltildi. Eksik pywebpush bağımlılığı yalnız adayın `.venv` ortamına kuruldu; global Python ve sunucu bağımlılıkları değiştirilmedi. Kullanılan yerel sürümler üretim bağımlılık kilidi değildir. Tarayıcı becerisinin önerdiği agent-browser bulunmadığından mevcut Playwright kullanıldı. v48/v47 dosyaları dahil mevcut değişiklikler korunmuştur; git diff yalnız bu turun farkı değildir.

## Dürüst ürün sınırları

- **Yeniden açılışta internet gerekir.** Önceki sürümün tam çevrimdışı yeniden açılışı sınıf hesabına aynen taşınmadı; eski tarayıcı kimliğine güvenip başka öğrencinin defterini açmamak için başlangıç kilidi var. Açık onaylı oturum bağlantı kaybında yerel kaydı sürdürür; sunucu işlemi doğrulanmadan devam etmez.
- Tarayıcıdaki notlar yerel açık veridir; aynı işletim sistemi/tarayıcı profilini kontrol eden kişiye karşı kriptografik koruma değildir. Çıkış veya askıya alma indirilmiş içeriği uzaktan silmez. Ortak cihazda ayrı profil gerekir.
- Eski hesapsız defterler otomatik aktarılmaz. Dağıtımdan önce JSON yedeği ve doğru hesaba elle geri yükleme planı gerekir; eski IndexedDB silinmez.
- E-posta giriş kodu ile uçtan uca yedek şifreleme parolası farklıdır. Şifreleme parolası kaybolursa mevcut yedeği yönetici açamaz. Parola kurtarma veya anahtar emaneti eklenmedi.
- Sunucu yedek kotası önceki **5 MB şifreli veri** sınırında kaldı. İstemcinin PDF içe alma limitiyle aynı şey değildir; PDF ağırlıklı gerçek ders kullanımı öncesinde kullanıcı başına kota, depolama ve dosya saklama tasarımı gerekir.
- Bu aday başvuruları tek sınıf listesi olarak yönetir; ders/sınıf grupları, öğrenci belgesi doğrulaması, içerik paylaşımı ve öğretmen not izleme eklenmedi.

## Canlıya geçiş kapıları — henüz yapılmadı

1. **48 öğrenci + 2 yönetici** seçildi. Cloudflare planı ve tüm kuruluştaki mevcut kullanıcı kotası okunmalı; başka uygulamaların kullanıcıları da sayılabilir. Access girişini tamamlayan ve uygulama onayını bekleyen kişiler de koltuk tüketebilir; bu nedenle girişten önce dar e-posta listesi korunacak. Uygulamadaki 48 sınırı tek başına ücretsiz kalma garantisi değildir. [Kullanıcı sayımı](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/). Ücretli plan alınmadı. Hazır indirilebilir listenin Cloudflare'a güvenli uygulanması, adres çıkarılınca politika/oturum/koltuk durumunun kontrolü ve hata halinde kapalı kalma adımları henüz uygulanmadı.
2. Sunucunun tam depo, bağımlılık ve middleware yapısında üç modülün entegrasyon testleri yapılmalı; gerçek DB yolu/kapasite ve alınmış geri yüklenebilir yedek doğrulanmalı. Bu turun testleri tam `linux-ai-server` uygulamasını başlatmadı.
3. Onaylı iki pilot öğrenci hesabıyla gerçek e-posta kodu, ret/askıya alma ve iki fiziksel cihaz eşitleme testi yapılmalı. Yönetici kimliği için daha güçlü ek koruma seçeneği değerlendirilmeli.
4. Kaynak/istemci hash'leri yeniden karşılaştırılmalı; eski istemcilerin koşulsuz API isteklerinin bilinçli olarak reddedileceği duyurulmalı. JSON dışa aktarma ve geri dönüş planı tamamlanmalı.
5. Gerçek kayıt açılmadan istek/hesap başı hız sınırı, başvuru kötüye kullanım sınırı, yedek kotası, veri silme/saklama süreci, bağımsız yedek geri dönüş denemesi ve sınıf büyüklüğüne uygun yük testi tamamlanmalı.
6. Kullanıcıya tam yayın kapsamı ve geri dönüş adımı sunulup onay alınmalı. Önce arka uç ve kimlik koruması, sonra istemci; **en son** yalnız Bilge Defter Access politikasına listede ve onaylı olan adresler için erişim açılmalı. Access Bypass/Everyone ile anonim koruma kaldırılmamalı; başka uygulamaların politikaları değiştirilmemeli.

Canlı sunucu, DB, Access/DNS, servis ve mevcut öğrenciler üzerinde değişiklik yapılmadı. Commit/push yok. Sunucudaki mevcut `infra/monitoring/prometheus.yml` değişikliğine dokunulmadı.

## Resmî kaynaklar

- [Cloudflare e-posta kodu](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Cloudflare JWT doğrulaması](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare Access kullanıcı planları](https://www.cloudflare.com/plans/)
