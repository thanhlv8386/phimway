# Phimway to IINA

Script Node.js giúp stream phim trực tiếp từ Phimway sang trình phát IINA trên macOS, tự động tải phụ đề và tối ưu hóa trải nghiệm xem phim qua dòng lệnh (CLI).

## 🚀 Tính năng nổi bật
- **Tìm kiếm thông minh:** Tìm phim theo tên, ID, hoặc theo định dạng Season/Episode.
- **Tự động tạo Playlist liên tục:** Khi chọn phát một tập, script sẽ tự động tạo danh sách phát (`.m3u`) từ tập đó đến hết Season của phim bộ và nạp vào IINA. Bạn có thể bấm Next/Previous trực tiếp trong trình phát.
- **Tải & Tự động nạp phụ đề (Fetch & Inject Subtitles):**
  - Tải song song cả phụ đề Tiếng Việt (`VN`) và Tiếng Anh (`EN`) (sắp xếp theo lượt thích) về thư mục tạm dưới định dạng `.vtt`.
  - Kết nối ngầm với IINA qua IPC Socket để tự động nạp phụ đề chính xác khi bạn chuyển tập phim mới.
- **Tích hợp IINA nâng cao:** Tự động mở IINA qua dòng lệnh và đồng bộ hoá qua IPC.
- **Xử lý mượt mà:** Giao diện CLI thân thiện, hỗ trợ chọn phim/tập trực quan, thoát chương trình sạch sẽ bằng Ctrl+C.

## 📋 Hướng dẫn sử dụng nhanh

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `node phimway.js` | Chế độ tương tác (nhập tên phim thủ công) |
| `node phimway.js 322` | Mở phim hoặc tập theo ID cụ thể |
| `node phimway.js Fallout` | Tìm phim `Fallout`, ưu tiên bản Movie |
| `node phimway.js Fallout 2` | Tìm `Fallout`, mở Season 2 hoặc Episode 2 |
| `node phimway.js Fallout 2/4` | Tìm `Fallout`, phát Season 2 Episode 4 và tự động thêm các tập tiếp theo vào playlist |

---

## 📂 Chi tiết cơ chế hoạt động

### 1. Cơ chế tự động tạo Playlist
Khi bạn chọn một tập phim bộ để phát (ví dụ: tập 4 của Season 2):
1. Script sẽ xác định các tập tiếp theo từ tập đó cho đến hết Season.
2. Tải thông tin đường dẫn stream (`srcUrl`) cho toàn bộ các tập này.
3. Tạo một file danh sách phát `.m3u` tạm thời tại thư mục `/tmp/phimway-playlist-...`.
4. Mở IINA với file playlist này. Nhờ đó, bạn có thể dễ dàng chuyển tập tiếp theo trực tiếp bằng trình điều khiển của IINA mà không cần quay lại dòng lệnh.

### 2. Tải và tự động nạp Phụ đề qua IPC (Inter-Process Communication)
Khi phát một luồng video trực tuyến từ playlist, IINA không thể tự động tìm phụ đề local. Do đó script sử dụng cơ chế IPC:
1. Với mỗi tập trong playlist, script tự động tải các phụ đề Tiếng Việt và Tiếng Anh tốt nhất về thư mục tạm.
2. Script sẽ khởi động một cổng kết nối IPC socket ngầm giữa Terminal và IINA.
3. Mỗi khi bạn chuyển tập phim trên IINA, trình phát sẽ phát sự kiện `file-loaded`. Script ngầm bắt được sự kiện này, lấy đường dẫn stream hiện tại và gửi lệnh `sub-add` qua IPC socket để nạp đúng file phụ đề của tập đó vào IINA ngay lập tức.
4. Bạn chỉ cần giữ cửa sổ Terminal chạy ngầm trong khi xem để phụ đề được nạp tự động.

---

## 🔍 Chi tiết các chế độ

### 1. Chế độ tương tác
Chạy lệnh mà không truyền tham số, script sẽ hỏi bạn tên phim:
```bash
node phimway.js
```
*Kết quả:* Script sẽ hiện danh sách phim khớp nhất để bạn chọn bằng số thứ tự.

### 2. Mở theo ID
Dùng khi bạn đã biết ID của phim hoặc tập phim trên Phimway:
```bash
node phimway.js 68125
```
- Nếu ID là một tập phim: Phát luôn.
- Nếu ID là phim bộ: Hiện danh sách mùa/tập để chọn tiếp.

### 3. Tìm kiếm và phát (Auto-search)
Tìm nhanh một bộ phim. Script sẽ tự động lấy kết quả đầu tiên có độ khớp cao nhất:
```bash
node phimway.js "The Dark Knight"
```
*Gợi ý:* Nếu tên phim có khoảng trắng, hãy bọc trong dấu nháy kép.

### 4. Tìm theo Season/Episode
Script hỗ trợ cú pháp thông minh để tìm nhanh tập phim trong phim bộ:
```bash
# Tìm phim Fallout và mở Season 2
node phimway.js Fallout 2

# Tìm phim Fallout và phát ngay Season 2, Episode 4
node phimway.js Fallout 2/4
```

---

## 🛠 Yêu cầu hệ thống
- **macOS** (vì script sử dụng trình phát IINA).
- **Node.js** (phiên bản 18 trở lên).
- **IINA Player** và `iina-cli` (thường đi kèm khi cài IINA).

## 📦 Cài đặt
1. Clone hoặc tải file `phimway.js` về máy.
2. Đảm bảo bạn đã cài các dependencies (nếu có dùng thư mục `node_modules`).
3. Cấp quyền thực thi (tùy chọn): `chmod +x phimway.js`.

---
*Chúc bạn xem phim vui vẻ!*
