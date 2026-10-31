export type Language = 'ar' | 'en';
const errors:Record<string,string>={
'Unable to load your club data. Please try again.':'تعذر تحميل بيانات النادي. حاولي مرة اخرى.',
'Request not allowed.':'تعذر تنفيذ الطلب. حدثي الصفحة وحاولي مرة اخرى.',
'Enter a Saudi mobile number and a 5-digit PIN.':'ادخلي رقم جوال سعودي ورمزا سريا من ٥ ارقام.',
'Too many attempts. Try again in 15 minutes.':'محاولات كثيرة. حاولي مرة اخرى بعد ١٥ دقيقة.',
'Unable to create this account. Try signing in instead.':'تعذر انشاء الحساب. جربي تسجيل الدخول.',
'Use a name between 2 and 40 characters.':'اكتبي اسما من حرفين الى ٤٠ حرفا.',
'The phone number or PIN is incorrect.':'رقم الجوال او الرمز السري غير صحيح.',
'Please sign in first.':'سجلي دخولك اولا.',
'Your current PIN is incorrect.':'الرمز السري الحالي غير صحيح.',
'Choose a 5-digit PIN.':'اختاري رمزا سريا من ٥ ارقام.',
'Type DELETE to confirm.':'اكتبي DELETE لتاكيد الحذف.',
'Unknown action.':'تعذر تنفيذ الطلب.',
'Something went wrong. Please try again.':'حدث خطا. حاولي مرة اخرى.'
};
export function localizeError(message:string,lang:Language){return lang==='ar'?(errors[message]||'تعذر الاتصال. حاولي مرة اخرى.'):(message in errors?message:'Unable to connect. Please try again.');}
export const arabicAwards:Record<string,{name:string;desc:string}>={
first:{name:'اول ارسال',desc:'اول مشاركة لك مع رش.'},
regular:{name:'من اهل الملعب',desc:'كل مشاركة تضيف لحكايتك.'},
club:{name:'واحدة منا',desc:'صار لرش مكان في جدولك.'},
podium:{name:'على منصة التتويج',desc:'مركز بين الثلاث الاوائل في الترتيب الاسبوعي.'},
streak:{name:'الصدارة مستمرة',desc:'اسابيع اكثر بين الثلاث الاوائل.'},
champ:{name:'نجمة رش',desc:'مكان ثابت في المقدمة.'},
free:{name:'الملعب يعزمك',desc:'اول مشاركة مجانية تجمعينها.'},
collector:{name:'الخير يتكرر',desc:'مشاركات مجانية اكثر في رصيدك.'},
love:{name:'عشان حب اللعب',desc:'مجموعة انجازات تستاهل الرجعة.'}
};
export const arabicCategories:Record<string,string>={'On the court':'في الملعب','Chasing the podium':'طريق الصدارة','A little extra':'مكافاة اللعب'};
