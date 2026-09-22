# Bilge Defter — davetli yayın

Adres: https://defter.bilgearena.com

Güncel sürüm v22: davetli ve özel Tailscale yayını aynı sürüme getirildi. Güncel durum, doğrulama ve geri dönüş sınırları BILGE_DEFTER_V22.md dosyasındadır. Aşağıdaki v21/v20 bölümleri tarihsel kayıttır.

## Güncelleme: v21 — görsel ve klavye desteği

Kullanıcı davetli girişin çalıştığını doğruladı. Davetli yayına v21 eklendi; özel Tailscale yayını v20 olarak korundu.

- Araçlar → Metin ekle: ekran/fiziksel klavyeyle çok satırlı not, yazı boyutu ve renk.
- Araçlar → Görsel ekle: PNG/JPEG/WebP, en fazla 10 MB girdi; cihazda uzun kenarı 1000 px olacak şekilde küçültülür. Çıktı en fazla 2 MB, sayfada 12 görsel, defter ve Çöp Kutusunda benzersiz görseller toplam 24 MB. HEIC ve SVG bu dilimde desteklenmiyor.
- Araçlar → Metin / görsel düzenle: öğeye kalem/fareyle dokunarak düzenleme, genişlik değiştirme, açık konum seçimi ve silme. Dokunma uyumluluğu için avuç koruması kapatılabilir. Silgi metin/görselin görünen kısmını da silebilir; bütünüyle kaldırma Düzenle → Sil ile yapılır.
- Kısayollar: T metin, P kalem, E silgi, Ctrl/⌘+Z geri al. Metin kutusunda normal metin düzenleme çalışır. Metin taslağı Sayfaya ekle ile uygulanır; Kapat ile vazgeçilir.
- Metin/görsel, PDF üzerinde de kullanılabilir; çevrim dışı açılış, sayfa temizleme öncesi Çöp Kutusu kopyası ve JSON yedekte korunur. Yeni içerik eklenince veri sürümü 3 / yedek biçimi 5 olur. Eski uygulama bu yedeği açmaz; sessiz veri kaybı yerine sürüm reddi amaçlanmıştır.
- 96 eski davranış + 13 yeni medya + 8 PWA = 117 yerel kontrol geçti. Sunucudaki gerçek paket SSH üzerinden bağımsız tarayıcıda ayrıca 13 medya kontrolünü geçti. Public giriş kapısı 11 kontrolü ve yeni media-workspace.js için 302 yönlendirme kontrolünü geçti. Fiziksel tablet ekran klavyesi/harici klavye kabulü henüz yapılmadı.

Güncelleme: Araçlar → Uygulama kurulumu → Güncellemeyi denetle; paket hazır olduğunda tüm Bilge Defter sekmelerini ve ana ekran uygulamasını kapatıp yeniden açın. Üstte v21 görünmeli. Tarayıcı verilerini silmeyin. Güncellemeden önce bağımsız JSON yedek alın.

Yeni yayın: /opt/bilge-defter-invited/releases/20260920-v21-media. Yeni web konteyneri 858b35bfe078f978342376e3fea2a6f3f076dff115c7b9dcbbd928dd07176799. Yapılandırma nginx-v21.conf. SHA256SUMS: 32a4f7cbaf48036671b677efeeaa2892f941686dac42e3474a4e5a6750e48425. Durdurulmuş önceki konteyner bilge-defter-invited-web-rollback-v20 ve v20 dosyaları saklandı; DNS, Access, tünel ve diğer çalışan servisler değişmedi.

Önemli geri dönüş sınırı: v21 ile yeni metin/görsel oluşturulduktan sonra v20 yeni veri biçimini açamaz. Böyle bir durumda kullanıcı yedeğini koruyup v21 uyumlu düzeltme tercih edilir; tarayıcı verileri silinmez. Eski konteynerin saklanması veri sürümünün otomatik geri çevrildiği anlamına gelmez.

İzin verilen adresler: turgut.urer@gmail.com ve sevdilurer@gmail.com. E-posta adresi yazılarak Send login code düğmesine basılır; gelen kod yalnızca giriş ekranına yazılır. Tailscale kurulumu gerekmez. Oturum süresi 24 saattir.

## Doğrulanmış durum — 20 Eylül 2026

- Ayrı Cloudflare Access uygulaması, yalnızca iki tam e-posta adresini içeren tek Allow kuralı ve e-posta PIN sağlayıcısı kuruldu. Herkese açık / bypass kuralı yok.
- Yeni ve ayrı Tunnel sağlıklı: dört bağlantı. Tünelin kendisi de Access JWT doğrulaması yapacak şekilde ayarlı. Diğer host adlarına 404 kuralı var.
- Yalnızca defter.bilgearena.com için proxied CNAME eklendi. Diğer DNS kayıtları, mevcut Access uygulaması/politikası ve mevcut tünel yapılandırması önceki durumla aynı.
- Yeni web servisi yalnızca sunucunun 127.0.0.1:18790 adresinde dinliyor. Dışarıdan yeni açık port yok. Tünel sağlık portu 127.0.0.1:18789. Her iki konteyner salt-okunur ve yeniden başlama politikasıyla çalışıyor.
- Önceki tüm çalışan konteynerlerin kimlikleri ve özel Bilge Defter index içeriği değişmedi. Canlı Bilge Arena değiştirilmedi.
- Yeni pakette 8 yerel gerçek-tarayıcı testi geçti: çevrim dışı çizim/kayıt, 14 sayfalık PDF, JSON yedek/geri dönüş, bozuk güncelleme reddi ve güvenli güncelleme dahil.
- Yayında 11 kontrol geçti: dokuz farklı uygulama adresi girişsiz Access ekranına yönleniyor; sahte oturum uygulamayı açamıyor; 390 px tarayıcıda doğru e-posta kodu ekranı görülüyor.
- Gerçek e-posta teslimi, davetli girişinin tamamlanması ve yeni adresten fiziksel tablet PWA kurulumu henüz kullanıcı tarafından doğrulanmadı. Kod gönderilmedi; bu kontroller tamamlandı sayılmaz.

## Notlar ve cihaz geçişi

Bu yayın, v20 uygulamasının ayrı kopyasıdır. Çizim ve veri biçimi aynı; kurulum açıklamaları davetli bağlantıya uyarlandı. Eski özel yayın yerinde durur.

Notlar yalnızca kullanılan tarayıcı/cihazda tutulur; sunucuya eşitlenmez. Yeni alan adı eski uygulamanın notlarını otomatik görmez. Önce eski uygulamada Araçlar → Yedek al, sonra yeni adreste Araçlar → Yedek yükle kullanın. Önizlemede içeriği kontrol edin; yükleme hedefteki defterlerin yerine geçer.

E-posta kontrolü uygulamanın internetten alınmasını sınırlar. Daha önce indirilmiş çevrim dışı uygulamayı veya yerel notları daveti kaldırarak uzaktan silemez. Ortak cihazda farklı kişiler ayrı tarayıcı profili kullanmalıdır; e-posta hesabı değiştirmenin yerel notları ayırdığı varsayılmamalıdır.

## İşletim ve geri alma sınırı

- Sunucu kökü: /opt/bilge-defter-invited
- Sabit yayın: /opt/bilge-defter-invited/releases/20260920-v20-invited
- Konteynerler: bilge-defter-invited-web ve bilge-defter-invited-cloudflared
- Access uygulaması: ad7dea78-dde6-433f-8ef0-74f8d62f6bdd
- Allow politikası: feb12342-8a1b-49d2-a286-dbe6879e0977
- Tunnel: 44ec4472-cd4c-4ef8-8100-ed3c4e2d0275
- DNS kaydı: 30333c1825aa292dd8e99aab6e2e62b4
- Zone: bd201cce2ca524333cc7f13757501f89
- Yeni PIN sağlayıcısı: 8d17dcf3-8ea9-47fb-9a13-003fe1bdded6

Geri alma gerekirse önce kimlikler ve adlar tekrar doğrulanır; yalnızca yeni cloudflared konteyneri durdurularak yeni dış erişim kesilir. Sonra yalnızca yukarıdaki DNS kaydı kaldırılır. DNS yayılımı bitene ve tünel kapalı olana kadar Access koruması kaldırılmaz. Yeni web servisi durdurulabilir; sürüm dosyaları geri dönüş için korunur. Diğer uygulamalar, tüneller, DNS kayıtları ve eski /opt/bilge-defter-test yayını kapsam dışıdır. PIN sağlayıcısı hesap düzeyindedir; başka uygulama kullanmaya başladıysa silinmez. Bu geri alma uygulanmadı.

Hiçbir gizli anahtar bu raporda bulunmaz. Tünel anahtarı yalnızca sunucudaki korumalı dosyada, 0400 izniyle tutulur.
