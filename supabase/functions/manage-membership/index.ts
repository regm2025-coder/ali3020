import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "يجب تسجيل الدخول أولاً." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return respond({ error: "إعدادات الخادم غير مكتملة." }, 500);
    }

    const token = authorization.slice("Bearer ".length);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "جلسة الدخول غير صالحة." }, 401);

    const { user_id, status } = await request.json();
    if (typeof user_id !== "string" || !["approved", "rejected"].includes(status)) {
      return respond({ error: "بيانات الطلب غير صحيحة." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: manager, error: managerError } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", authData.user.id)
      .eq("role", "manager")
      .eq("status", "approved")
      .maybeSingle();

    if (managerError || !manager) return respond({ error: "هذه العملية متاحة للمدير المعتمد فقط." }, 403);

    const { data: target, error: targetError } = await admin
      .from("memberships")
      .select("id, role, status")
      .eq("user_id", user_id)
      .eq("organization_id", manager.organization_id)
      .maybeSingle();

    if (targetError || !target || target.role !== "employee" || target.status !== "pending") {
      return respond({ error: "طلب العضوية غير موجود أو تمت معالجته مسبقاً." }, 404);
    }

    const { error: updateError } = await admin
      .from("memberships")
      .update({ status })
      .eq("id", target.id);

    if (updateError) return respond({ error: "تعذر تحديث حالة العضوية." }, 500);

    return respond({
      success: true,
      message: status === "approved" ? "تمت الموافقة على العضوية." : "تم رفض طلب العضوية.",
    });
  } catch {
    return respond({ error: "حدث خطأ غير متوقع أثناء معالجة الطلب." }, 500);
  }
});
