# Bilge Defter

## Güncel teslim: v52

Tek UI kaynağı `work/bilge-defter-test/ui-v2/ui-v2-bridge.js` ile mevcut
v52 çalışma ağacıdır. Eski `ui-v2` dalı tarihsel karşılaştırma içindir;
üretim köprüsü olarak birleştirilmez. Uygulama ve bağımsız hesap servisinin
kaynakları bu depoda birlikte sürümlenir; ortak Klipper monoliti bu pakete dahil değildir.

Temiz kurulum (Node 22+, Python 3.12+):

```powershell
npm ci
npx playwright install chromium
python -m venv server-candidate/v49/.venv
server-candidate/v49/.venv/Scripts/python -m pip install -r server-candidate/v49/requirements-test-lock.txt
npm test
server-candidate/v49/.venv/Scripts/python -m unittest discover -s tools -p "test_*.py"
```

Linux'ta Python yolu `.venv/bin/python` olur. `BILGE_PYTHON` ile ayrı test
yorumlayıcısı seçilebilir. Testler yalnız sentetik yerel veri kullanır.
`npm test` önce canlı v52 paket hash'ini doğrular; eski v51 girdisini kayıtlı
delta ve hash'lerden üretir, güncelleme dahil tüm güncel süitleri çalıştırır.
Eski tarihli yardımcı testlerin tamamının taşınabilir olduğu iddia edilmez.

Teslim, UI kararı ve geri dönüş: [docs/DELIVERY_V52.md](docs/DELIVERY_V52.md).
Gerçek cihaz/sınıf kabulü: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).
OCR karşılaştırması: [docs/OCR_BENCHMARK.md](docs/OCR_BENCHMARK.md).

`work/classroom.env`, gerçek DB, anahtarlar, özel örnekler ve çalışma
ortamları Git'e girmez. Yayın betikleri ayrı açık yayın onayı olmadan çalıştırılmaz.
Push, master birleştirmesi ve canlı yayın; yerel commit/testten ayrı işlemlerdir.

## İlk klasör aktarımının tarihsel kaydı

Yeni yerel proje klasoru: `D:\Projelerim\bilge-defter`.

- Uygulama kaynaklari: `work/bilge-defter-test/`
- Testler, yayin paketleri ve yardimci dosyalar: `work/`
- Gelistirme plani: `work/BILGE_DEFTER_PLAN_DURUMU.md`
- Raporlar: `outputs/`

2026-09-21 tarihinde onceki calisma klasorunden 3.203 dosya kopyalandi.
Tum kopyalar SHA-256 ile birebir dogrulandi (138.174.310 bayt).
Bu README, dogrulanan kopyalara ek olarak olusturuldu.

Onceki klasor silinmedi:
`D:\Codex\2026-09-20\referenced-chatgpt-conversation-this-is-an`

Bu islem yalnizca yerel proje dosyalarini kopyaladi; canli yayin ve
tarayicida saklanan notlar degistirilmedi. Codex gorevinin mevcut calisma
dizini otomatik degismedi; sonraki islemlerde yeni proje yolu kullanilmalidir.
