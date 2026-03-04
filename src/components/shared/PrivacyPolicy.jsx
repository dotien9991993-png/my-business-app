import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-10">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Chính Sách Bảo Mật</h1>
          <p className="text-sm text-gray-500 mb-6">Cập nhật lần cuối: 04/03/2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Giới thiệu</h2>
              <p>
                Ứng dụng <strong>Hoang Nam Audio</strong> ("Ứng dụng") được phát triển bởi Hoàng Nam Audio
                (sau đây gọi là "chúng tôi"). Chính sách bảo mật này giải thích cách chúng tôi thu thập,
                sử dụng và bảo vệ thông tin cá nhân của bạn khi sử dụng Ứng dụng.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Thông tin chúng tôi thu thập</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Thông tin tài khoản:</strong> Tên, email, số điện thoại khi bạn đăng nhập.</li>
                <li><strong>Dữ liệu sử dụng:</strong> Thông tin đơn hàng, sản phẩm, khách hàng mà bạn nhập vào hệ thống.</li>
                <li><strong>Camera:</strong> Chỉ khi bạn cho phép, để quét mã QR hoặc chụp ảnh sản phẩm.</li>
                <li><strong>Thông tin thiết bị:</strong> Loại thiết bị, phiên bản hệ điều hành để tối ưu trải nghiệm.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Mục đích sử dụng</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Cung cấp và duy trì dịch vụ quản lý bán hàng, kho hàng, tài chính.</li>
                <li>Xử lý đơn hàng, thanh toán và giao hàng.</li>
                <li>Gửi thông báo liên quan đến đơn hàng và hoạt động kinh doanh.</li>
                <li>Cải thiện và phát triển tính năng mới cho Ứng dụng.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Chia sẻ thông tin</h2>
              <p>
                Chúng tôi <strong>không bán</strong> thông tin cá nhân của bạn cho bên thứ ba.
                Thông tin chỉ được chia sẻ trong các trường hợp:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Đối tác vận chuyển (tên, địa chỉ, SĐT) để giao hàng.</li>
                <li>Cổng thanh toán để xử lý giao dịch.</li>
                <li>Khi pháp luật yêu cầu.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Bảo mật dữ liệu</h2>
              <p>
                Dữ liệu được lưu trữ trên hạ tầng Supabase với mã hóa SSL/TLS.
                Mỗi tenant (doanh nghiệp) có dữ liệu tách biệt hoàn toàn.
                Chúng tôi áp dụng các biện pháp kỹ thuật hợp lý để bảo vệ thông tin của bạn.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Quyền của bạn</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Truy cập và xem thông tin cá nhân của bạn.</li>
                <li>Yêu cầu chỉnh sửa hoặc xóa thông tin.</li>
                <li>Thu hồi quyền truy cập camera, thông báo bất cứ lúc nào trong cài đặt thiết bị.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Lưu trữ dữ liệu</h2>
              <p>
                Dữ liệu được lưu trữ trong suốt thời gian bạn sử dụng dịch vụ.
                Khi bạn ngừng sử dụng, dữ liệu sẽ được giữ tối đa 90 ngày trước khi xóa vĩnh viễn,
                trừ khi pháp luật yêu cầu lưu trữ lâu hơn.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Liên hệ</h2>
              <p>Nếu bạn có câu hỏi về chính sách bảo mật, vui lòng liên hệ:</p>
              <div className="bg-gray-50 rounded-lg p-4 mt-2 text-sm">
                <p><strong>Hoàng Nam Audio</strong></p>
                <p>Email: contact@hoangnamaudio.vn</p>
                <p>Điện thoại: 0901 234 567</p>
                <p>Website: hoangnamaudio.vn</p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Thay đổi chính sách</h2>
              <p>
                Chúng tôi có thể cập nhật chính sách này theo thời gian.
                Mọi thay đổi sẽ được thông báo qua Ứng dụng hoặc email.
                Việc tiếp tục sử dụng Ứng dụng đồng nghĩa với việc bạn chấp nhận chính sách mới.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t text-center text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Hoang Nam Audio. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
