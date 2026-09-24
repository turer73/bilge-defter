# Bilge Defter v49 — izole sunucu doğrulaması ve yayın kapısı

23 Eylül 2026. **Son durum: kullanıcının açık yetki onayı sonrası davetli adres v49'a geçirildi.** Yeni sınıfla gerçek OTP/uygulama içi kabul henüz tamamlanmadı. Aşağıdaki ilk hazırlık bölümleri tarihsel kayıttır.

## Onaylı canlı geçiş — tamamlananlar

- Kullanıcı; bir yıllık ayrı anahtar, hesap düzeyinde Access politikası yazma ve uygulama/kullanıcı/abonelik okuma, korumalı Klipper dosyasında saklama ve yalnız Bilge Defter v49 yayınını açıkça onayladı. Önceki genel yayın onayı güvenlik denetiminden geçmemişti; o reddedilen komut çalıştırılmadı. Ayrıntılı onay sonrası işlem başarılı oldu.
- `bilge-defter-classroom-v49` adlı dar anahtar oluşturuldu. Bitiş: **23 Eylül 2027 17:49:07 UTC**. İzinler: Access Apps Read, Access Policies Write, Access Audit Logs Read, Billing Read. DNS, tünel, ödeme değiştirme veya başka anahtar oluşturma izni verilmedi. Anahtar 0600, UID/GID 10001 korumalı dosyada; değeri repo veya sohbet çıktısına yazılmadı.
- Yeni anahtarın dört gerekli okuması ve gerçek politika yazma yetkisi doğrulandı. Yazma denemesi yalnız mevcut Bilge Defter politikasını **aynı içerikle** geri yazdı; sonrasında iki yönetici e-postası ve tüm koşulların aynı kaldığı doğrulandı. Öğrenci eklenmedi; diğer politika/DNS/tüneller değiştirilmedi.
- Gerçek eski DB yolu çalışan servisin ayarından doğrulandı: `/opt/linux-ai-server/data/claude_memory.db`. Bilge Defter şifreli yedek tablosunda **0 kayıt** vardı. Bu cihaz IndexedDB notlarının bulunmadığı anlamına gelmez. Kaynak DB salt-okunur açıldı ve değiştirilmedi.
- Yeni hesap DB'sinin `before-public-v49.sqlite` yedeği oluşturuldu; ayrı bellek veritabanına geri açma ve bütünlük denetimi başarılı (4 tablo). Yedek SHA-256: `30e5fce3023b8764eac61ed246a8028a6831d37978f1f4686da9208a3b41b70f`.
- Davetli web, `127.0.0.1:18790` üzerinden v49 sunuyor; `current` artık `/opt/bilge-defter-classroom-v49/ui`. `bilge-defter-accounts` servisinde gerçek giriş izni eşitlemesi etkin. Eski konteyner `bilge-defter-invited-web-rollback-v49` adıyla durdurulmuş olarak korundu; silinmedi.
- **HTTP üzerinden 229/229 SHA256SUMS girdisi** doğrulandı; bu sayı çevrimdışı manifestteki 228 varlıktan farklıdır. `release.json` v49. Yeni DB bütünlüğü `ok`, izin durumu `verified`, izinli e-posta 2, gözlenen koltuk 2.
- Genel HTTPS adresi girişsiz istekte 302 ile Cloudflare e-posta girişine yönlendiriyor. Temiz Chromium oturumunda e-posta alanı görünür ve uygulama içeriği görünmez. Gerçek e-posta kodu istenmedi/girilmedi. Kullanıcının oturumuna erişen uygulama içi tarayıcı aracı altyapı hatasıyla başlatılamadı; mevcut Playwright ile yalnız girişsiz koruma doğrulandı. Gerçek yönetici kabulü yapılmış sayılmıyor.
- Özel Tailscale adresi v46'da bırakıldı. `linux-ai-server` aktif; modül hash'i ve önceden kirli dosyası aynı. Bilge Arena'ya veya başka uygulamaya müdahale edilmedi. Commit/push yok; ücretli hizmet açılmadı.

**Kullanıcı kabulü:** önemli yerel not varsa JSON yedeğini saklayın; kurulu uygulamada güncellemeyi denetleyin ve yeni paket hazır olunca tüm Bilge Defter pencerelerini kapatıp yeniden açın. v49 → Ayarlar → Uygulama kurulumu → Hesabım ve sınıf üzerinden yönetici e-postasını ve Öğrenci ekle alanını kontrol edin. Tarayıcı verilerini silmeyin. Eski hesapsız notlar otomatik sahiplenilmez; doğru hesaba JSON ile aktarılabilir.

**Hâlâ yapılmayanlar:** gerçek öğrenci OTP/onay/askı pilotu, fiziksel cihaz kabulü, günlük bağımsız yedek zamanlaması, saklama/silme süreci ve mevcut 5 MB sunucu yedeği sınırının PDF ağırlıklı kullanım kararı. Sınıfın tamamını sorunsuz kullanıma hazır ilan etmiyoruz.

## Canlıdan okunan gerçekler

- Klipper bağlantısı doğrulandı. Paylaşılan `linux-ai-server` HEAD: `911f07f6f42b889ecf3cf367b28e40185afcf7ec`; `bilge_defter.py` özeti `d5e0480a5bd2d12417836c40808ffae291c5c53518b5ec04004c6da50263950a`. Kaynak dosya ve servis değiştirilmedi. Önceden kirli `infra/monitoring/prometheus.yml` korundu.
- Davetli ve özel adresler hâlâ `20260923-v46-session-uyari`. Davetli v46 SHA256SUMS özeti `a364d7c99d16a28bd5711034ee12a1edfa8ba2b8592c420f31b18df0c6365f8a`.
- Cloudflare abonelik API'si `teams_free`, fiyat 0, 50 kullanıcı verdi. Kullanıcı API'sinde iki erişim koltuğu var: seçilen iki yönetici; Gateway koltuğu yok. Bu anlık gözlemdir, gelecek kota garantisi değildir.
- `defter.bilgearena.com` uygulamasında tek izin politikası ve yalnız iki yönetici e-postası var. Mevcut uygulama/politika/DNS/tünel ayarı değiştirilmedi. Ücretli abonelik açılmadı.

## Bu turda gerçekten değişenler

- Yalnız `/opt/bilge-defter-classroom-v49` altında aday dosyalar ve Docker görüntüleri oluşturuldu.
- Yeni `bilge-defter-accounts` servisi ve `bilge-defter-classroom-preview` web servisi, ayrı `bilge-defter-classroom` ağı üzerinde çalışıyor. Önizleme yalnız `127.0.0.1:18791` portunda; hesap servisine host portu açılmadı. Yazılabilir alan ayrı veri dizini; süreç 10001 UID ile, salt-okunur kök ve kaynak sınırlarıyla çalışır.
- Eski merkezi veritabanı yeni servise bağlanmadı; henüz gerçek not/yedek aktarılmadı. Yeni servis kendi veritabanını kullanacak. Mevcut monolitin config/DB test taklitleri kaldırıldı, ayrı üretim giriş noktası ve gerçek DB adaptörü kullanıldı. Paylaşılan servis yeniden başlatılmayacak.
- Öğrenci onay/ret/askı kararından sonra yalnız belirlenmiş Cloudflare uygulama politikasını eşitleyen kod eklendi. Uygulama/kimlik sağlayıcı/politika uyuşmazlığı, farklı kural, beklenmedik e-posta, ücretli veya doğrulanamayan plan, yetersiz kuruluş kotası halinde yeni giriş izni yazılmaz. API hatası veya okuma-sonrası uyuşmazlığı başarı gösterilmez.
- Askıya alma önce yerel yetkiyi kapatır; Cloudflare başarısız olsa da korunmuş API'lere yeni istek reddedilir. İndirilmiş yerel veriler uzaktan silinmez. Eski Access çerezinin anında küresel iptali uygulanmadı; uygulama yetki kontrolü bağımsızdır.
- Yönetici ekranında giriş izni sonucu ve yeniden denetle/uygula düğmesi var. Diğer yapılandırılmış yöneticiye öğrenci ret/askı düğmeleri gösterilmez. Dar anahtar henüz oluşturulmadığından izole çalışan serviste `BILGE_DEFTER_EDGE_SYNC=0`.
- Anahtar oluşturma aracı yalnız önizleme modunda çalıştırıldı. Önerilen yeni anahtar: bu hesaba bağlı Access Apps Read, Access Policies Write, Access Audit Logs Read, Billing Read; bir yıl süreli. DNS, tünel, başka anahtar oluşturma veya ödeme değiştirme yetkisi yok. Cloudflare token izinleri hesap düzeyindedir; tek uygulamaya daraltma ayrıca kodun sabit hedef kontrolüyle yapılır. Anahtar repo/çıktıya yazılmadan SSH üzerinden 0600 korumalı dosyaya gidecek. **Kullanıcı seçimi bekliyor; mevcut geniş anahtar sunucuya kopyalanmadı.**

## Son test kanıtı

| Test | Sonuç |
|---|---|
| Üretim modülleri + JWT + SQLite + Cloudflare hata/kota senaryoları | Windows 61/61; Linux Python 3.12 üretim bağımlılıklarıyla aynı 61/61 |
| Tarayıcı hesap ayrımı, kayıt ve çıkış | 13/13 |
| Tarayıcı elle öğrenci ekleme/onay/indirme | 8/8 |
| Kayıt/eşitleme/OCR/PDF/PWA kontrolleri | 29/29 |
| Sadece ilgili şifreli tablonun aktarımı, üzerine yazmama, bağımsız yedekten geri açma | 3/3 sentetik |
| Gerçek Linux nginx + üretim API + Chromium | Kimliksiz erişim kilitli, defter açılmıyor, tarayıcı hatası yok |
| İstemci paketi | 228/228 dosya özeti eşleşiyor |

Toplam **115 ayrı kontrol**; 61 sunucu kontrolünün iki ortamda çalıştırılması toplamı yapay olarak büyütmedi. Cloudflare yazma testleri taklit API üzerinde yapıldı; gerçek izin yazımı ve yeni sınıf hesabıyla OTP teslimi henüz denenmedi. Fiziksel cihaz ve tam ders günü yük testi yok. 50 ekleme isteği 10 eşzamanlı işçiyle sınandı; 48 kabul, 2 kontenjan reddi; gerçek 50 fiziksel cihaz yüküyle aynı değildir.

Son istemci SHA256SUMS dosyasının SHA-256 değeri: `8221c3e8c8da75d4ba6cb2d2d261db499c2486bc5e0d4d1cbb3af01692f13fff`.

Üretim görüntüsü: `bilge-defter-accounts:v49`, yerel Docker görüntü kimliği `sha256:675fc576b5e4081889899a63d5f23d067dc3bd75b936acea2866c063d1f5b0bb`. Python temel görüntüsü derlemede `sha256:2f17fc044b579bab302c2e8054d3a686e2cb9a83de48e70534b94cd8ebbe06a9` olarak çözüldü. Bağımlılıklar üst düzey sürümlere sabitli; tam transitif hash kilidi henüz yok.

İlk kurulum denemesinde sayısal Linux kullanıcı sahipliği ve Windows testinde açık SQLite bağlantısı hatası oldu; kaynak düzeltildi, üç işlem testi ve izole başlatma yeniden başarılı çalıştı. Linux testlerinde bağımlılık kaynaklı kullanımdan kaldırma uyarısı var; hata değil. İlk Cloudflare sorgusunda PowerShell dizi adresi hatası 404 verdi; ayrı doğru adreslerle tekrar sorgu başarılı. Token kullanıcı-endpoint'i bu hesap anahtarına uygun değildi; hesap-endpoint'iyle aktif olduğu doğrulandı.

## Yayından önce zorunlu sonraki sıra

1. Ayrı dar yetkili servis anahtarı tercihini netleştir; sonra `work/create-classroom-token.ps1 -Create`. Yeni anahtarla gereken dört okuma ve tek politika yazma yetkisini doğrula. Yetki yetersizse otomatik genişletme yok.
2. Kullanıcının mevcut v46 cihaz notlarından JSON yedeği alındığını doğrula. Yeni hesap veritabanı eskisini silmez ama otomatik sahiplenmez; gerekirse doğru yönetici hesabına elle geri yükle.
3. Eski çalışma servisinin gerçek `BILGE_DEFTER_DB` ayarını doğrula; yoksa kanonik merkezi DB kullanılır. Mevcut sunucu scriptindeki kaynak yolunu buna göre kontrol et. Yalnız Bilge Defter şifreli yedek tablosu taşınacak; merkezi hafıza/diğer uygulama verileri taşınmaz.
4. Yayın komutu ve geri dönüş kapsamını onayla. `work/deploy-classroom.sh activate` yalnız davetli web konteynerini değiştirir. Önce iki-yönetici politikasını yerinde doğrular; yazıcı durduktan sonra seçili şifreli tabloyu yeni DB'ye taşır ve bağımsız yedek/geri dönüş denetimi yapar. Yeni DB'de yedek varsa üzerine yazmayı reddeder. Bu adım bu turda çalıştırılmadı.
5. Gerçek yönetici oturumuyla hesap ekranı, yedekleme ve güncelleme; kullanıcı tarafından seçilen pilot öğrenciyle e-posta kodu, onay ve askı akışını doğrula. Otomatik güncelleme eski açık taslakları zorla yenilemez.
6. Sınıfa açmadan önce günlük bağımsız yedek zamanlaması, saklama/silme talebi süreci ve PDF ağırlıklı kullanım için mevcut 5 MB şifreli sunucu yedek sınırı kararı tamamlanmalı. Bunlar tamamlandı sayılmıyor.

Geri dönüş: aktivasyonun kendi hata yakalayıcısı, daha öğrenci alınmadan önce eski iki-yönetici yayınına döner; yeni DB'yi silmez. **Öğrenci kabulünden sonraki geri dönüş farklıdır:** önce yeni öğrenci erişimleri kapatılmalı, yeni DB ayrıca yedeklenmeli; v46 öğrenci hesap ayrımına sahip olmadığından öğrenciye açık politika ile doğrudan v46'ya dönülmemelidir.

Commit/push yapılmadı. Başka uygulamalar durdurulmadı/değiştirilmedi. İzole deneme servisleri sonraki devam için çalışır durumda bırakıldı.
