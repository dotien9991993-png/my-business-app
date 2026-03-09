import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../../supabaseClient';

/**
 * Hook quản lý Push Notifications trên native (iOS/Android).
 * - Xin quyền + register device
 * - Lưu token vào Supabase device_tokens
 * - Xử lý notification khi app đang mở (foreground)
 * - Xử lý tap notification → navigate đến đúng module
 *
 * @param {object} currentUser - user đã login
 * @param {string} tenantId - tenant ID
 * @param {function} onNavigate - callback({ type, id }) để navigate
 */
export function usePushNotifications(currentUser, tenantId, onNavigate) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!currentUser?.id || !tenantId) return;
    if (!Capacitor.isNativePlatform()) return;
    if (registeredRef.current) return;

    let listeners = [];

    const setup = async () => {
      try {
        // Xin quyền
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== 'granted') return;

        // Register với APNs/FCM
        await PushNotifications.register();

        // Nhận token → lưu DB
        const regListener = await PushNotifications.addListener('registration', async (tokenData) => {
          const token = tokenData.value;
          if (!token) return;

          const platform = Capacitor.getPlatform(); // 'ios' or 'android'
          const { error } = await supabase
            .from('device_tokens')
            .upsert({
              user_id: currentUser.id,
              tenant_id: tenantId,
              token,
              platform,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,platform' });

          if (error) console.error('Lỗi lưu device token:', error);
        });
        listeners.push(regListener);

        // Lỗi đăng ký
        const errListener = await PushNotifications.addListener('registrationError', (err) => {
          console.error('Push registration error:', err);
        });
        listeners.push(errListener);

        // Notification khi app đang mở (foreground)
        const fgListener = await PushNotifications.addListener('pushNotificationReceived', (_notification) => {
          // Không làm gì đặc biệt — để hệ thống hiện banner nếu có
          // Có thể thêm in-app toast ở đây sau
        });
        listeners.push(fgListener);

        // Tap notification → navigate
        const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification?.data;
          if (!data) return;

          // data format: { type: 'task'|'order'|'technical_job', id: '...' }
          if (data.type && data.id && onNavigate) {
            onNavigate({ type: data.type, id: data.id });
          }
        });
        listeners.push(tapListener);

        registeredRef.current = true;
      } catch (err) {
        console.error('Push notification setup error:', err);
      }
    };

    setup();

    return () => {
      listeners.forEach(l => l.remove());
    };
  }, [currentUser?.id, tenantId, onNavigate]);
}
