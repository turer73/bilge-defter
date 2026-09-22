# Bilge Defter v24 — sayfa üzerinde metin/görsel yerleşimi

## Kullanım

Araçlar → Öğeyi düzenle → metin veya görsele dokunun.

- Öğenin içinden sürükleyin: konum değişir.
- Mavi ↘ tutamacını sürükleyin: görsel oranı korunarak boyutlanır; metinde kutu ve yazı boyutu birlikte değişir.
- İçeriği düzenle: önceki metin, renk, genişlik ve silme penceresini açar.
- Geri al: son tamamlanan taşıma/boyutlandırmayı geri getirir.
- Bitti: kalemle yazma ve iki parmakla sayfada gezinme moduna döner.

Yerleşim modunda tek parmak, kalem veya fare kullanılabilir. Normal yazı modundaki avuç koruması değişmez. Seçim modunda ikinci parmak dokunma hareketini iptal eder; sayfayı kaydırmak için Bitti kullanılmalıdır. Serbest el çizgileri bu sürümde nesne olarak taşınmaz.

## Kayıt güvenliği

Sürükleme sırasında yalnız önizleme çizilir; sayfa verisi değişmez. Bırakıldığında tek kayıt/geri alma adımı oluşur. Escape, pointercancel, pencere odağının kaybı ve etkin hareket sırasında boyut değişmesi önizlemeyi iptal eder. Kayıt hatasında önceki disk verisi korunur, bellekteki sonuç yeniden kaydedilebilir. Eski sekme başka sekmenin kaydını ezemez. Veri/yedek şeması değişmedi; v23 uyumluluğu korunuyor.

## Doğrulama

- 152 yerel kontrol: önceki 137 regresyon + 15 yeni yerleşim kontrolü.
- Canlı Tailscale HTTPS: 15 yerleşim + 13 metin/görsel + 6 PWA = 34 kontrol.
- Davetli public adres: 15 erişim kapısı kontrolü. İzinli e-posta oturumu test aracıyla açılmadı; kullanıcının kurulu v24 uygulama kabulü ayrıca bekliyor.
- Gerçek tarayıcı fare/dokunma olayları, sentetik kalem/avuç, oranlı boyutlandırma, metin ölçeği, iptal, geri al, yeniden açılış, çevrim dışı düzenleme, kayıt hatası ve eski sekme çakışması sınandı.
- PDF %200 yakınlaştırma ve yatay/dikey kaydırmada belge koordinatları doğrulandı. PDF dışa aktarma, içe aktarma ve yakınlaştırma regresyonları geçti. Çıktı Poppler ile yeniden görüntülenip incelendi.
- 390 px ekran görüntüsü incelendi: seçim çubuğu çizim alanının dışındadır; kalem araçları geçici gizlenir; 44 px tutamaç, öğe kenarı ekran dışındaysa görünür alanda tutulur.
- Fiziksel iPad/Android kalem hissi ve kullanıcı v24 güncelleme kabulü henüz doğrulanmadı.

## Yayın

21 Eylül 2026. Yalnız iki Bilge Defter servisi değişti; diğer çalışan konteyner kimlikleri korunuyor. Bilge Arena, DNS/Access/cache ve Tailscale değişmedi.

- Private release: /opt/bilge-defter-test/releases/20260921-v24-media-layout
- Davetli release: /opt/bilge-defter-invited/releases/20260921-v24-media-layout
- Private konteyner: df3412afe406135c4ddfe831d10900fd430944f396e7610abe9efa6cd291b7b0
- Davetli konteyner: ef0689e48d4f81e816c2627ff3ebff6fbce8145ed9271b994b56f3ff2cc71bf1
- SHA256SUMS özeti: 4eecb8476682fa693d73630911b9f17336e5c9d37824c3571ca657b9d66700b4
- Önceki v23 dizinleri ve rollback-before-v24 konteynerleri geri dönüş için saklandı. Sunulan dosyalar paketle karşılaştırıldı.

Takvim/elle çalışma planı sonraki dilimdir; kullanıcının bu yerleşim isteği öne alınmıştır. AI/eşitleme eklenmedi.
