import liff from "@line/liff";

export const initLiff = async (liffId) => {
  if (!liffId) throw new Error("Missing LIFF ID");

  await liff.init({ liffId });

  if (!liff.isLoggedIn()) {
    liff.login();
  }
};

export const getProfile = async () => {
  try {
    const profile = await liff.getProfile();
    return profile;
  } catch (err) {
    console.error("Error getting profile:", err);
    return null;
  }
};

export const getLineUserId = () => {
  try {
    const context = liff.getContext();
    return context?.userId || null; // ✅ ต้องมี return
  } catch (err) {
    console.error("Error getting context:", err);
    return null;
  }
};
