import { supabase } from '../supabaseClient';

/**
 * Ghi log hoạt động người dùng
 * Không throw error - log lỗi không nên chặn operation chính
 */
export const logActivity = async ({
  tenantId, userId, userName,
  module, action, entityType, entityId, entityName,
  oldData, newData, description
}) => {
  try {
    await supabase.from('activity_logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      user_name: userName,
      module,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      old_data: oldData || null,
      new_data: newData || null,
      description
    });
  } catch (e) {
    console.error('Activity log error:', e);
  }
};
