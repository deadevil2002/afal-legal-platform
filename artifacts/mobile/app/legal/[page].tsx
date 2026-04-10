import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type LegalPage =
  | "privacy-policy"
  | "terms-of-use"
  | "account-deletion-policy"
  | "data-retention-policy"
  | "contact-support";

type Section = { heading: string; body: string };
type PageContent = { title: string; sections: Section[] };
type BilingualContent = { en: PageContent; ar: PageContent };

const CONTENT: Record<LegalPage, BilingualContent> = {
  "privacy-policy": {
    en: {
      title: "Privacy Policy",
      sections: [
        {
          heading: "Introduction",
          body: "Arabian Fal Legal Services Platform (\"Arabian Fal\", \"we\", \"us\", \"our\") is committed to respecting and protecting the privacy of all users who access and use this platform. This Privacy Policy explains in detail what personal data we collect, the purposes for which it is processed, how it is stored and protected, and the rights available to you under applicable data protection laws. By using Arabian Fal, you acknowledge that you have read and understood this policy.",
        },
        {
          heading: "Data We Collect",
          body: "We collect the following categories of personal data:\n\n• Identity Data: Full name, employee number, and department.\n• Contact Data: Email address and mobile phone number.\n• Account Data: Hashed authentication credentials managed securely by Firebase Authentication.\n• Usage Data: Legal service requests you submit, the content of messages exchanged within request threads, document attachments, status updates, and timestamps of all interactions.\n• Technical Data: Device type, operating system, application version, and session metadata used for platform stability and security.",
        },
        {
          heading: "How We Use Your Data",
          body: "Your personal data is processed exclusively for the following purposes:\n\n• To create and maintain your account on the Arabian Fal platform.\n• To receive, route, and process your legal service requests.\n• To facilitate communication between you and the legal services team through secure in-app messaging.\n• To track the progress and status of your legal matters through the eight-stage workflow.\n• To enable administrators to manage platform users and maintain service quality.\n• To generate anonymised service reports for internal operational purposes.\n\nWe do not sell, rent, or share your personal data with any third party for commercial or marketing purposes.",
        },
        {
          heading: "Data Storage and Security",
          body: "All data is stored in Google Firebase Firestore, a secure cloud database protected by access control rules enforced at the platform level. File attachments are stored in Cloudinary using restricted, role-controlled upload presets. Authentication is handled exclusively by Firebase Authentication with secure token management.\n\nAccess to user data within the platform is role-restricted: regular users can only access their own data, while administrators can access data within their authorised scope. All data in transit is protected by TLS encryption. We continuously review our security practices to protect against unauthorised access, disclosure, or misuse.",
        },
        {
          heading: "Data Retention",
          body: "We retain your personal profile data for the duration of your employment relationship with the organisation and for a period of up to twelve (12) months following account deletion, unless a longer retention period is required by applicable law or regulation. Legal service request records and associated conversation threads are retained for a minimum of seven (7) years for legal, audit, and compliance purposes. For full details, please refer to our Data Retention Policy.",
        },
        {
          heading: "Your Rights",
          body: "Subject to applicable law, you have the following rights in relation to your personal data:\n\n• The right to access: You may request a copy of the personal data we hold about you.\n• The right to rectification: You may request correction of inaccurate or incomplete data through the Profile Change Request feature in Settings.\n• The right to erasure: You may request deletion of your account and associated data. See the Account Deletion Policy for the scope and limitations of this right.\n• The right to restriction: In certain circumstances, you may request that processing of your data be restricted.\n• The right to object: You may object to certain forms of data processing where permitted by law.\n\nTo exercise any of these rights, please contact your HR department or Data Protection Officer.",
        },
        {
          heading: "Changes to this Policy",
          body: "We may update this Privacy Policy periodically to reflect changes in our practices, technology, or applicable legal requirements. Any material changes will be communicated through the platform. Your continued use of Arabian Fal following the publication of an updated policy constitutes your acceptance of those changes.",
        },
        {
          heading: "Contact",
          body: "If you have any questions, concerns, or complaints regarding this Privacy Policy or the way in which your personal data is handled, please contact your HR department or the designated Data Protection Officer for your organisation.",
        },
      ],
    },
    ar: {
      title: "سياسة الخصوصية",
      sections: [
        {
          heading: "المقدمة",
          body: "تلتزم منصة فال العربية للخدمات القانونية (\"فال العربية\"، \"نحن\"، \"لنا\") باحترام وحماية خصوصية جميع المستخدمين الذين يصلون إلى هذه المنصة ويستخدمونها. تشرح سياسة الخصوصية هذه بالتفصيل البيانات الشخصية التي نجمعها، والأغراض التي تُعالَج من أجلها، وكيفية تخزينها وحمايتها، والحقوق المتاحة لك بموجب قوانين حماية البيانات المعمول بها. باستخدامك لمنصة فال العربية، فإنك تقر بأنك قرأت هذه السياسة وفهمتها.",
        },
        {
          heading: "البيانات التي نجمعها",
          body: "نجمع الفئات التالية من البيانات الشخصية:\n\n• بيانات الهوية: الاسم الكامل، ورقم الموظف، والقسم.\n• بيانات التواصل: عنوان البريد الإلكتروني ورقم الهاتف المحمول.\n• بيانات الحساب: بيانات اعتماد المصادقة المشفرة التي تُدار بأمان عبر Firebase Authentication.\n• بيانات الاستخدام: طلبات الخدمة القانونية التي تقدمها، ومحتوى الرسائل المتبادلة في خيوط الطلبات، ومرفقات المستندات، وتحديثات الحالة، وطوابع وقت جميع التفاعلات.\n• البيانات التقنية: نوع الجهاز، ونظام التشغيل، وإصدار التطبيق، وبيانات الجلسة المستخدمة لاستقرار المنصة وأمانها.",
        },
        {
          heading: "كيف نستخدم بياناتك",
          body: "تُعالَج بياناتك الشخصية حصراً للأغراض التالية:\n\n• إنشاء حسابك على منصة فال العربية والحفاظ عليه.\n• استلام طلبات الخدمة القانونية وتوجيهها ومعالجتها.\n• تسهيل التواصل بينك وبين فريق الخدمات القانونية عبر المراسلة الآمنة داخل التطبيق.\n• تتبع تقدم وحالة شؤونك القانونية عبر مراحل العمل الثماني.\n• تمكين المسؤولين من إدارة مستخدمي المنصة والحفاظ على جودة الخدمة.\n• إعداد تقارير خدمة مجهولة المصدر لأغراض تشغيلية داخلية.\n\nلا نبيع بياناتك الشخصية أو نؤجرها أو نشاركها مع أي طرف ثالث لأغراض تجارية أو تسويقية.",
        },
        {
          heading: "تخزين البيانات وأمانها",
          body: "تُخزَّن جميع البيانات في Google Firebase Firestore، وهي قاعدة بيانات سحابية آمنة محمية بقواعد التحكم في الوصول المطبقة على مستوى المنصة. تُخزَّن مرفقات الملفات في Cloudinary باستخدام إعدادات رفع محدودة خاضعة للتحكم في الأدوار. تتم المصادقة حصراً عبر Firebase Authentication مع إدارة رمز آمنة.\n\nالوصول إلى بيانات المستخدم داخل المنصة مقيد بالأدوار: يمكن للمستخدمين العاديين الوصول إلى بياناتهم الخاصة فقط، بينما يمكن للمسؤولين الوصول إلى البيانات ضمن نطاقهم المعتمد. تُحمى جميع البيانات أثناء النقل بتشفير TLS. نراجع ممارسات الأمان لدينا باستمرار للحماية من الوصول غير المصرح به.",
        },
        {
          heading: "الاحتفاظ بالبيانات",
          body: "نحتفظ ببيانات ملفك الشخصي طوال مدة علاقة العمل مع المنظمة ولمدة تصل إلى اثني عشر (12) شهراً بعد حذف الحساب، ما لم يقتضِ القانون أو اللوائح المعمول بها فترة احتفاظ أطول. تُحتفظ بسجلات طلبات الخدمة القانونية وخيوط المحادثات المرتبطة بها لمدة لا تقل عن سبع (7) سنوات لأغراض قانونية ورقابية وامتثال. للاطلاع على التفاصيل الكاملة، يرجى الرجوع إلى سياسة الاحتفاظ بالبيانات.",
        },
        {
          heading: "حقوقك",
          body: "وفقاً للقانون المعمول به، يحق لك ممارسة الحقوق التالية فيما يتعلق ببياناتك الشخصية:\n\n• حق الوصول: يمكنك طلب نسخة من البيانات الشخصية التي نحتفظ بها عنك.\n• حق التصحيح: يمكنك طلب تصحيح البيانات غير الدقيقة أو غير المكتملة عبر ميزة طلب تغيير الملف الشخصي في الإعدادات.\n• حق الحذف: يمكنك طلب حذف حسابك والبيانات المرتبطة به. راجع سياسة حذف الحساب لمعرفة نطاق هذا الحق وقيوده.\n• حق التقييد: في ظروف معينة، يمكنك طلب تقييد معالجة بياناتك.\n• حق الاعتراض: يمكنك الاعتراض على أشكال معينة من معالجة البيانات حيثما يسمح بذلك القانون.\n\nللممارسة أي من هذه الحقوق، يرجى التواصل مع قسم الموارد البشرية أو مسؤول حماية البيانات.",
        },
        {
          heading: "التغييرات على هذه السياسة",
          body: "قد نُحدِّث سياسة الخصوصية هذه بشكل دوري لتعكس التغييرات في ممارساتنا أو تقنيتنا أو المتطلبات القانونية المعمول بها. سيتم إبلاغ أي تغييرات جوهرية عبر المنصة. يُعدّ استمرارك في استخدام فال العربية بعد نشر سياسة محدَّثة قبولاً منك لتلك التغييرات.",
        },
        {
          heading: "التواصل",
          body: "إن كانت لديك أي أسئلة أو مخاوف أو شكاوى تتعلق بسياسة الخصوصية هذه أو بالطريقة التي تُعالَج بها بياناتك الشخصية، فيرجى التواصل مع قسم الموارد البشرية أو مسؤول حماية البيانات المعين في مؤسستك.",
        },
      ],
    },
  },

  "terms-of-use": {
    en: {
      title: "Terms of Use",
      sections: [
        {
          heading: "Acceptance of Terms",
          body: "By accessing or using the Arabian Fal Legal Services Platform, you agree to be bound by these Terms of Use, our Privacy Policy, and all applicable laws and regulations. If you do not agree with any part of these terms, you must immediately cease using the platform and notify your system administrator.",
        },
        {
          heading: "Authorised Users",
          body: "Arabian Fal is an internal enterprise platform available exclusively to authorised employees and personnel of the organisation. Access is granted through an invitation and registration process administered by a designated Super Admin. You are responsible for maintaining the confidentiality of your login credentials. Sharing your username, password, or account access with any other person — whether inside or outside the organisation — is strictly prohibited and may result in immediate account suspension.",
        },
        {
          heading: "Permitted Use",
          body: "You are authorised to use Arabian Fal solely for the following purposes:\n\n• Submitting legitimate legal service requests on your own behalf in relation to your employment.\n• Communicating with the legal services team through the secure in-app messaging function.\n• Reviewing the status, progress, and updates on your submitted requests.\n• Managing your account profile and submitting profile change requests where applicable.\n\nAny other use — including submitting false or misleading information, attempting to access other users' data, reverse engineering the platform, or using the platform to harass or harm others — is expressly prohibited.",
        },
        {
          heading: "Prohibited Conduct",
          body: "You must not:\n\n• Submit requests containing false, fraudulent, or misleading information.\n• Attempt to access, modify, or delete data belonging to other users.\n• Upload files containing malware, viruses, or any malicious code.\n• Use the platform for any purpose unrelated to your legitimate legal service needs.\n• Attempt to circumvent any security or access control measures.\n• Interfere with or disrupt the platform's infrastructure or other users' use of the platform.\n\nViolation of these prohibitions may result in immediate account suspension, disciplinary action, and/or referral to the appropriate legal authorities.",
        },
        {
          heading: "Intellectual Property",
          body: "All software, design, branding, content, and associated intellectual property rights in the Arabian Fal platform are owned exclusively by Arabian Fal Legal Services or its licensors. You are granted a limited, non-exclusive, non-transferable licence to use the platform for its intended purpose during the term of your authorised access. You may not copy, reproduce, modify, distribute, or create derivative works from any part of the platform without prior written authorisation.",
        },
        {
          heading: "Limitation of Liability",
          body: "To the fullest extent permitted by applicable law, Arabian Fal Legal Services shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the platform, including but not limited to loss of data, loss of business opportunity, or reputational harm. The platform is provided on an 'as is' and 'as available' basis, and we do not warrant that it will be free from errors, interruptions, or security vulnerabilities at all times.",
        },
        {
          heading: "Modifications and Termination",
          body: "We reserve the right to modify, suspend, or terminate access to the platform — in whole or in part — at any time, with or without notice, for reasons including but not limited to maintenance, security incidents, or policy changes. We also reserve the right to update these Terms of Use at any time. Continued use of the platform following publication of updated terms constitutes acceptance of those terms.",
        },
        {
          heading: "Governing Law",
          body: "These Terms of Use shall be governed by and construed in accordance with the applicable laws of the jurisdiction in which the organisation operates. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts of that jurisdiction.",
        },
      ],
    },
    ar: {
      title: "شروط الاستخدام",
      sections: [
        {
          heading: "قبول الشروط",
          body: "بالوصول إلى منصة فال العربية للخدمات القانونية أو استخدامها، فإنك توافق على الالتزام بشروط الاستخدام هذه وسياسة الخصوصية الخاصة بنا وجميع القوانين واللوائح المعمول بها. إن كنت لا توافق على أي جزء من هذه الشروط، فيجب عليك التوقف فوراً عن استخدام المنصة وإخطار مسؤول النظام لديك.",
        },
        {
          heading: "المستخدمون المصرح لهم",
          body: "فال العربية منصة مؤسسية داخلية متاحة حصراً للموظفين والكوادر المعتمدين في المنظمة. يُمنح الوصول من خلال عملية الدعوة والتسجيل التي يديرها المسؤول الأعلى المعين. أنت مسؤول عن الحفاظ على سرية بيانات تسجيل الدخول الخاصة بك. يُحظر تماماً مشاركة اسم المستخدم أو كلمة المرور أو وصول الحساب مع أي شخص آخر — سواء داخل المنظمة أو خارجها — وقد يؤدي ذلك إلى تعليق الحساب فوراً.",
        },
        {
          heading: "الاستخدام المسموح به",
          body: "أنت مخوَّل باستخدام فال العربية حصراً للأغراض التالية:\n\n• تقديم طلبات الخدمة القانونية المشروعة نيابةً عن نفسك فيما يتعلق بعملك.\n• التواصل مع فريق الخدمات القانونية عبر وظيفة المراسلة الآمنة داخل التطبيق.\n• مراجعة حالة طلباتك المقدمة وتقدمها وتحديثاتها.\n• إدارة ملف حسابك وتقديم طلبات تغيير الملف الشخصي عند الاقتضاء.\n\nيُحظر صراحةً أي استخدام آخر، بما في ذلك تقديم معلومات كاذبة أو مضللة، أو محاولة الوصول إلى بيانات مستخدمين آخرين، أو هندسة المنصة عكسياً، أو استخدام المنصة لمضايقة الآخرين أو إيذائهم.",
        },
        {
          heading: "السلوك المحظور",
          body: "لا يجوز لك:\n\n• تقديم طلبات تتضمن معلومات كاذبة أو احتيالية أو مضللة.\n• محاولة الوصول إلى بيانات تخص مستخدمين آخرين أو تعديلها أو حذفها.\n• رفع ملفات تحتوي على برامج ضارة أو فيروسات أو أي رمز خبيث.\n• استخدام المنصة لأي غرض غير مرتبط باحتياجات الخدمة القانونية المشروعة الخاصة بك.\n• محاولة التحايل على أي إجراءات أمنية أو تحكم في الوصول.\n• التدخل في البنية التحتية للمنصة أو تعطيل استخدام المستخدمين الآخرين لها.\n\nقد يؤدي انتهاك هذه المحظورات إلى تعليق الحساب فوراً واتخاذ إجراءات تأديبية و/أو الإحالة إلى السلطات القانونية المختصة.",
        },
        {
          heading: "الملكية الفكرية",
          body: "جميع حقوق الملكية الفكرية المتعلقة بالبرمجيات والتصميم والعلامة التجارية والمحتوى في منصة فال العربية مملوكة حصراً لشركة فال العربية للخدمات القانونية أو المرخصين لها. تُمنح لك ترخيصاً محدوداً وغير حصري وغير قابل للتحويل لاستخدام المنصة للغرض المخصص لها خلال فترة وصولك المعتمد. لا يجوز لك نسخ أو استنساخ أو تعديل أو توزيع أو إنشاء أعمال مشتقة من أي جزء من المنصة دون تفويض مسبق وخطي.",
        },
        {
          heading: "تحديد المسؤولية",
          body: "إلى أقصى حد يسمح به القانون المعمول به، لن تكون شركة فال العربية للخدمات القانونية مسؤولة عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية أو عقابية تنشأ عن استخدامك للمنصة أو عدم قدرتك على استخدامها، بما في ذلك على سبيل المثال لا الحصر: فقدان البيانات، أو فقدان فرصة العمل، أو الضرر بالسمعة. تُقدَّم المنصة على أساس \"كما هي\" و\"حسب التوفر\"، ولا نضمن أنها ستكون خالية من الأخطاء أو الانقطاعات أو الثغرات الأمنية في جميع الأوقات.",
        },
        {
          heading: "التعديلات والإنهاء",
          body: "نحتفظ بالحق في تعديل أو تعليق أو إنهاء الوصول إلى المنصة — كلياً أو جزئياً — في أي وقت، مع أو بدون إشعار، لأسباب تشمل على سبيل المثال لا الحصر: الصيانة، أو الحوادث الأمنية، أو تغييرات السياسات. كما نحتفظ بالحق في تحديث شروط الاستخدام هذه في أي وقت. يُعدّ استمرارك في استخدام المنصة بعد نشر الشروط المحدَّثة قبولاً منك لتلك الشروط.",
        },
        {
          heading: "القانون الحاكم",
          body: "تخضع شروط الاستخدام هذه وتُفسَّر وفقاً للقوانين المعمول بها في الدولة التي تعمل فيها المنظمة. يخضع أي نزاع ينشأ فيما يتعلق بهذه الشروط للاختصاص القضائي الحصري للمحاكم المختصة في تلك الدولة.",
        },
      ],
    },
  },

  "account-deletion-policy": {
    en: {
      title: "Account Deletion Policy",
      sections: [
        {
          heading: "Overview",
          body: "This policy explains the procedures, scope, and consequences of account deletion on the Arabian Fal platform. Deletion requests can be initiated by the account holder (self-deletion) or by a Super Admin (administrative deletion). All deletions are permanent and cannot be reversed.",
        },
        {
          heading: "Self-Deletion",
          body: "You may delete your own account at any time by navigating to Settings → Delete My Account. The self-deletion process requires you to enter your current password to authenticate and confirm the action. Upon successful authentication, the following data is immediately and permanently removed:\n\n• Your user profile document from Firestore.\n• Your phone number uniqueness index record.\n• Your employee number uniqueness index record.\n• Any pending profile change requests associated with your account.\n\nSelf-deletion is immediate and irrevocable. Once completed, your access to the platform is permanently terminated.",
        },
        {
          heading: "Administrative Deletion",
          body: "A Super Admin may delete a user's platform data from the Admin dashboard under the Users tab. Administrative deletion requires the Super Admin to enter their own password to authenticate and confirm the action. Upon successful authentication, the following data is deleted from Firestore:\n\n• The target user's profile document.\n• The target user's phone number uniqueness index record.\n• The target user's employee number uniqueness index record.\n• Any pending profile change requests associated with the target account.\n\nImportant: Administrative deletion via the platform does not automatically remove the user's Firebase Authentication record (sign-in credentials). The Super Admin must separately remove the user from Firebase Console → Authentication to fully revoke their sign-in access.",
        },
        {
          heading: "Data Retained After Deletion",
          body: "The following data is NOT removed upon account deletion and is retained in accordance with the Data Retention Policy:\n\n• All legal service requests submitted by the deleted account.\n• All conversation threads and messages associated with those requests.\n• All file attachments submitted as part of legal requests.\n• Administrative audit logs referencing the account (e.g., role changes, status updates).\n\nThis data is retained for a minimum of seven (7) years for legal, audit, and regulatory compliance purposes and cannot be removed at the user's request.",
        },
        {
          heading: "Irreversibility",
          body: "Account deletion is permanent and cannot be undone. Once an account is deleted, the associated profile data cannot be restored, and any pending requests become orphaned within the system. If you need to use the platform again after deletion, a new account must be created through the standard registration process, subject to administrator approval.",
        },
        {
          heading: "Consequences of Deletion",
          body: "Upon deletion of your account:\n\n• You will be immediately signed out of all active sessions.\n• You will lose access to your request history within the user interface (the underlying data is retained for audit purposes).\n• Your name and contact details will no longer be searchable by administrators.\n• Any allocated employee number and phone number will be freed for future registration by another user.",
        },
      ],
    },
    ar: {
      title: "سياسة حذف الحساب",
      sections: [
        {
          heading: "نظرة عامة",
          body: "توضح هذه السياسة إجراءات حذف الحساب على منصة فال العربية ونطاقه وعواقبه. يمكن بدء طلبات الحذف من قِبل صاحب الحساب (الحذف الذاتي) أو من قِبل المسؤول الأعلى (الحذف الإداري). جميع عمليات الحذف دائمة ولا يمكن التراجع عنها.",
        },
        {
          heading: "الحذف الذاتي",
          body: "يمكنك حذف حسابك الخاص في أي وقت بالانتقال إلى الإعدادات ← حذف حسابي. تتطلب عملية الحذف الذاتي إدخال كلمة مرورك الحالية للمصادقة وتأكيد الإجراء. عند نجاح المصادقة، تُحذف البيانات التالية فوراً ونهائياً:\n\n• مستند ملفك الشخصي من Firestore.\n• سجل فهرس تفرد رقم الهاتف الخاص بك.\n• سجل فهرس تفرد رقم الموظف الخاص بك.\n• أي طلبات تغيير ملف شخصي معلقة مرتبطة بحسابك.\n\nالحذف الذاتي فوري وغير قابل للتراجع. بمجرد اكتماله، يتوقف وصولك إلى المنصة نهائياً.",
        },
        {
          heading: "الحذف الإداري",
          body: "يمكن للمسؤول الأعلى حذف بيانات منصة أحد المستخدمين من لوحة إدارة المسؤولين ضمن علامة تبويب المستخدمين. يتطلب الحذف الإداري من المسؤول الأعلى إدخال كلمة مروره الخاصة للمصادقة وتأكيد الإجراء. عند نجاح المصادقة، تُحذف البيانات التالية من Firestore:\n\n• مستند الملف الشخصي للمستخدم المستهدف.\n• سجل فهرس تفرد رقم الهاتف للمستخدم المستهدف.\n• سجل فهرس تفرد رقم الموظف للمستخدم المستهدف.\n• أي طلبات تغيير ملف شخصي معلقة مرتبطة بالحساب المستهدف.\n\nمهم: لا يؤدي الحذف الإداري عبر المنصة إلى حذف سجل مصادقة Firebase الخاص بالمستخدم (بيانات اعتماد تسجيل الدخول) تلقائياً. يجب على المسؤول الأعلى إزالة المستخدم بشكل منفصل من Firebase Console ← Authentication لإلغاء وصوله إلى تسجيل الدخول بالكامل.",
        },
        {
          heading: "البيانات المحتفظ بها بعد الحذف",
          body: "لا تُحذف البيانات التالية عند حذف الحساب وتُحتفظ بها وفقاً لسياسة الاحتفاظ بالبيانات:\n\n• جميع طلبات الخدمة القانونية المقدمة من الحساب المحذوف.\n• جميع خيوط المحادثات والرسائل المرتبطة بتلك الطلبات.\n• جميع مرفقات الملفات المقدمة كجزء من الطلبات القانونية.\n• سجلات التدقيق الإدارية التي تشير إلى الحساب (مثل تغييرات الأدوار، وتحديثات الحالة).\n\nتُحتفظ بهذه البيانات لمدة لا تقل عن سبع (7) سنوات لأغراض الامتثال القانوني والتدقيق والتنظيمي ولا يمكن إزالتها بناءً على طلب المستخدم.",
        },
        {
          heading: "اللارجعة",
          body: "حذف الحساب دائم ولا يمكن التراجع عنه. بمجرد حذف الحساب، لا يمكن استعادة بيانات الملف الشخصي المرتبطة به، وتصبح أي طلبات معلقة يتيمة داخل النظام. إذا كنت بحاجة إلى استخدام المنصة مرة أخرى بعد الحذف، فيجب إنشاء حساب جديد من خلال عملية التسجيل المعيارية، رهناً بموافقة المسؤول.",
        },
        {
          heading: "عواقب الحذف",
          body: "عند حذف حسابك:\n\n• ستُسجَّل خروجاً فورياً من جميع الجلسات النشطة.\n• ستفقد وصولك إلى سجل طلباتك ضمن واجهة المستخدم (تُحتفظ بالبيانات الأساسية لأغراض التدقيق).\n• لن يتمكن المسؤولون من البحث عن اسمك وبيانات الاتصال الخاصة بك.\n• سيتحرر رقم الموظف ورقم الهاتف المخصصان لك ويصبحان متاحَين للتسجيل المستقبلي من قِبل مستخدم آخر.",
        },
      ],
    },
  },

  "data-retention-policy": {
    en: {
      title: "Data Retention Policy",
      sections: [
        {
          heading: "Purpose",
          body: "This Data Retention Policy outlines the periods for which different categories of data collected and processed by the Arabian Fal Legal Services Platform are retained, the basis for those retention periods, and the procedures applied when data is no longer required.",
        },
        {
          heading: "User Profile Data",
          body: "Personal profile data — including your name, employee number, department, email address, and phone number — is retained for the duration of your active account on the platform. Following account deletion (whether self-initiated or administratively initiated), profile data is purged immediately from the primary Firestore database as part of the deletion process. However, residual references within audit logs and historical records may be retained for up to twelve (12) months thereafter.",
        },
        {
          heading: "Legal Service Request Records",
          body: "All legal service requests, including their full content, status history, and metadata, are classified as legal records and are retained for a minimum period of seven (7) years from the date of request closure. This retention period applies regardless of whether the account that submitted the request has been deleted. This period is mandated to meet legal, regulatory, and audit requirements applicable to legal service records within the organisation's operating jurisdiction.",
        },
        {
          heading: "Conversation Threads and Messages",
          body: "All messages exchanged within request conversation threads are treated as part of the legal case record and are retained for the same minimum period of seven (7) years from the date the associated request is closed. These records may be required as evidence in legal proceedings or regulatory inquiries and therefore cannot be deleted upon request.",
        },
        {
          heading: "File Attachments",
          body: "Files uploaded as attachments to legal service requests — including documents, images, and other files stored in Cloudinary — are retained for the same period as the associated request record (minimum seven years from request closure). Deletion of a user account does not trigger deletion of files submitted as part of an active or closed legal request.",
        },
        {
          heading: "Administrative and Audit Logs",
          body: "Logs of administrative actions performed within the platform — including role changes, account deletions, status updates, and Super Admin actions — are retained for a minimum of three (3) years. These logs are maintained to ensure accountability, support internal investigations, and meet compliance obligations.",
        },
        {
          heading: "Authentication and Security Logs",
          body: "Authentication events and security-related logs (sign-in attempts, session data) managed by Firebase Authentication are retained in accordance with Google Firebase's standard data retention policies, typically for a period of up to ninety (90) days, or as otherwise configured for the organisation's Firebase project.",
        },
        {
          heading: "Data Deletion Requests",
          body: "Requests for deletion of data beyond the scope of the platform's built-in account deletion feature — such as requests to remove historical legal records — must be directed to the HR department or Data Protection Officer. Such requests are evaluated on a case-by-case basis against applicable legal retention requirements, and may not always be fulfilled where retention is mandated by law or regulation.",
        },
      ],
    },
    ar: {
      title: "سياسة الاحتفاظ بالبيانات",
      sections: [
        {
          heading: "الغرض",
          body: "تحدد سياسة الاحتفاظ بالبيانات هذه المدد التي تُحتفظ خلالها بالفئات المختلفة من البيانات التي تجمعها منصة فال العربية للخدمات القانونية وتعالجها، والأساس لتلك المدد، والإجراءات المطبقة عند عدم الحاجة إلى البيانات.",
        },
        {
          heading: "بيانات الملف الشخصي للمستخدم",
          body: "تُحتفظ ببيانات الملف الشخصي — بما في ذلك الاسم ورقم الموظف والقسم وعنوان البريد الإلكتروني ورقم الهاتف — طوال مدة وجود حسابك النشط على المنصة. بعد حذف الحساب (سواء بمبادرة ذاتية أو بمبادرة إدارية)، تُحذف بيانات الملف الشخصي فوراً من قاعدة بيانات Firestore الأساسية كجزء من عملية الحذف. غير أن الإشارات المتبقية في سجلات التدقيق والسجلات التاريخية قد تُحتفظ بها لمدة تصل إلى اثني عشر (12) شهراً بعد ذلك.",
        },
        {
          heading: "سجلات طلبات الخدمة القانونية",
          body: "تُصنَّف جميع طلبات الخدمة القانونية، بما فيها محتواها الكامل وسجل حالتها وبياناتها الوصفية، على أنها سجلات قانونية وتُحتفظ بها لمدة لا تقل عن سبع (7) سنوات من تاريخ إغلاق الطلب. تُطبَّق هذه المدة بغض النظر عما إذا كان الحساب الذي قدّم الطلب قد حُذف أم لا. تُفرض هذه المدة لاستيفاء المتطلبات القانونية والتنظيمية وممارسات التدقيق المعمول بها لسجلات الخدمة القانونية في نطاق عمل المنظمة.",
        },
        {
          heading: "خيوط المحادثات والرسائل",
          body: "تُعامَل جميع الرسائل المتبادلة في خيوط محادثات الطلبات باعتبارها جزءاً من سجل القضية القانونية، وتُحتفظ بها للمدة الدنيا ذاتها البالغة سبع (7) سنوات من تاريخ إغلاق الطلب المرتبط. قد تكون هذه السجلات مطلوبة كدليل في الإجراءات القانونية أو الاستفسارات التنظيمية، ولذلك لا يمكن حذفها بناءً على الطلب.",
        },
        {
          heading: "مرفقات الملفات",
          body: "تُحتفظ بالملفات المرفوعة كمستندات مرفقة بطلبات الخدمة القانونية — بما فيها المستندات والصور وغيرها من الملفات المخزنة في Cloudinary — للمدة ذاتها المتعلقة بسجل الطلب المرتبط (سبع سنوات على الأقل من إغلاق الطلب). لا يؤدي حذف حساب مستخدم إلى حذف الملفات المقدمة كجزء من طلب قانوني نشط أو مغلق.",
        },
        {
          heading: "سجلات الإدارة والتدقيق",
          body: "تُحتفظ بسجلات الإجراءات الإدارية المنفذة ضمن المنصة — بما فيها تغييرات الأدوار وحذف الحسابات وتحديثات الحالة وإجراءات المسؤول الأعلى — لمدة لا تقل عن ثلاث (3) سنوات. تُصان هذه السجلات لضمان المساءلة، ودعم التحقيقات الداخلية، والوفاء بالتزامات الامتثال.",
        },
        {
          heading: "سجلات المصادقة والأمان",
          body: "تُحتفظ بأحداث المصادقة والسجلات المتعلقة بالأمان (محاولات تسجيل الدخول، وبيانات الجلسة) التي تديرها Firebase Authentication وفقاً لسياسات الاحتفاظ بالبيانات المعيارية لـ Google Firebase، عادةً لمدة تصل إلى تسعين (90) يوماً، أو على النحو الذي تم تكوينه لمشروع Firebase الخاص بالمنظمة.",
        },
        {
          heading: "طلبات حذف البيانات",
          body: "يجب توجيه طلبات حذف البيانات التي تتجاوز نطاق ميزة حذف الحساب المدمجة في المنصة — كطلبات إزالة السجلات القانونية التاريخية — إلى قسم الموارد البشرية أو مسؤول حماية البيانات. تُقيَّم هذه الطلبات كل حالة على حدة وفق متطلبات الاحتفاظ القانونية المعمول بها، وقد لا يمكن تلبيتها دائماً حين يكون الاحتفاظ مفروضاً بموجب القانون أو اللوائح.",
        },
      ],
    },
  },

  "contact-support": {
    en: {
      title: "Contact & Support",
      sections: [
        {
          heading: "Platform Technical Support",
          body: "If you experience technical issues with the Arabian Fal platform — such as login failures, application errors, inability to submit requests, or any other system-level problems — please contact your IT department or designated system administrator. Provide a clear description of the issue, including the steps you took before the problem occurred, any error messages displayed, and your device type and operating system.",
        },
        {
          heading: "Legal Service Inquiries",
          body: "For questions or follow-ups related to your legal service requests — including case status, expected timelines, required documents, or outcomes — please use the in-app messaging thread within your specific request. Navigate to your request and send a message directly to the legal team. The legal services team monitors all in-platform messages during business hours and will respond as promptly as the nature of the matter allows.",
        },
        {
          heading: "Profile and Account Management",
          body: "If you need to update account information that cannot be changed directly — such as your employee number, phone number, or other identity-verified fields — please submit a Profile Change Request from Settings → Request a Profile Change. An administrator will review your request and either approve it (with the change applied automatically) or contact you for further verification.",
        },
        {
          heading: "Account Deletion Requests",
          body: "If you wish to delete your account, you may do so directly from Settings → Delete My Account (requires your current password). If you encounter any difficulties with the self-deletion process, or if you require administrative deletion of another user's account, please contact your Super Admin or HR department.",
        },
        {
          heading: "Data Protection and Privacy Inquiries",
          body: "For questions about how your personal data is collected, used, stored, or shared — or to exercise your data subject rights (access, rectification, erasure, restriction, objection) — please contact your HR department or the Data Protection Officer (DPO) designated by your organisation. All privacy-related inquiries will be handled in accordance with the organisation's data governance procedures.",
        },
        {
          heading: "Feedback and Improvement Suggestions",
          body: "We are committed to continuously improving the Arabian Fal platform. If you have suggestions, feature requests, or feedback about the platform's usability or functionality, please share them with your department administrator or through your organisation's internal feedback channels. Your input is valued and contributes directly to the development roadmap.",
        },
        {
          heading: "Emergency and Escalation",
          body: "If you believe your account has been compromised, if you have witnessed misuse of the platform, or if you have an urgent legal matter that requires immediate attention, please contact your Super Admin, HR department, or Legal department directly through your organisation's standard communication channels without delay.",
        },
      ],
    },
    ar: {
      title: "التواصل والدعم",
      sections: [
        {
          heading: "الدعم التقني للمنصة",
          body: "إذا واجهتَ مشاكل تقنية في منصة فال العربية — كفشل تسجيل الدخول، أو أخطاء التطبيق، أو عدم القدرة على تقديم الطلبات، أو أي مشاكل أخرى على مستوى النظام — فيرجى التواصل مع قسم تكنولوجيا المعلومات أو مسؤول النظام المعين. قدِّم وصفاً واضحاً للمشكلة، يتضمن الخطوات التي اتخذتها قبل حدوث المشكلة، وأي رسائل خطأ ظهرت، ونوع جهازك ونظام التشغيل.",
        },
        {
          heading: "استفسارات الخدمة القانونية",
          body: "للاستفسارات أو المتابعات المتعلقة بطلبات الخدمة القانونية الخاصة بك — بما فيها حالة القضية، والجداول الزمنية المتوقعة، والمستندات المطلوبة، أو النتائج — يرجى استخدام خيط المراسلة داخل التطبيق ضمن طلبك المحدد. انتقل إلى طلبك وأرسل رسالة مباشرةً إلى فريق الخدمات القانونية. يراقب فريق الخدمات القانونية جميع الرسائل داخل المنصة خلال ساعات العمل وسيرد بأسرع ما تتيحه طبيعة الموضوع.",
        },
        {
          heading: "إدارة الملف الشخصي والحساب",
          body: "إذا كنت بحاجة إلى تحديث معلومات حساب لا يمكن تغييرها مباشرةً — كرقم الموظف أو رقم الهاتف أو غيرها من الحقول الخاضعة للتحقق من الهوية — فيرجى تقديم طلب تغيير ملف شخصي من الإعدادات. سيراجع المسؤول طلبك ويوافق عليه (مع تطبيق التغيير تلقائياً) أو يتواصل معك للتحقق الإضافي.",
        },
        {
          heading: "طلبات حذف الحساب",
          body: "إذا كنت ترغب في حذف حسابك، فيمكنك القيام بذلك مباشرةً من الإعدادات ← حذف حسابي (تتطلب كلمة مرورك الحالية). إذا واجهتَ أي صعوبات في عملية الحذف الذاتي، أو إذا كنت بحاجة إلى الحذف الإداري لحساب مستخدم آخر، فيرجى التواصل مع المسؤول الأعلى أو قسم الموارد البشرية.",
        },
        {
          heading: "استفسارات حماية البيانات والخصوصية",
          body: "للاستفسار عن كيفية جمع بياناتك الشخصية واستخدامها وتخزينها ومشاركتها — أو لممارسة حقوقك كأصحاب بيانات (الوصول والتصحيح والحذف والتقييد والاعتراض) — يرجى التواصل مع قسم الموارد البشرية أو مسؤول حماية البيانات (DPO) المعين من قِبل مؤسستك. ستُعالَج جميع استفسارات الخصوصية وفقاً لإجراءات حوكمة البيانات في المنظمة.",
        },
        {
          heading: "الملاحظات ومقترحات التحسين",
          body: "نلتزم بالتحسين المستمر لمنصة فال العربية. إذا كانت لديك اقتراحات أو طلبات ميزات أو ملاحظات حول سهولة استخدام المنصة أو وظائفها، فيرجى مشاركتها مع مسؤول قسمك أو عبر قنوات الملاحظات الداخلية في مؤسستك. مساهمتك قيّمة وتُسهم مباشرةً في خارطة طريق التطوير.",
        },
        {
          heading: "الطوارئ والتصعيد",
          body: "إذا كنت تعتقد أن حسابك قد تعرض للاختراق، أو إذا شهدتَ سوء استخدام للمنصة، أو إذا كان لديك أمر قانوني عاجل يستدعي اهتماماً فورياً، فيرجى التواصل مع المسؤول الأعلى أو قسم الموارد البشرية أو القسم القانوني مباشرةً عبر قنوات التواصل المعيارية في مؤسستك دون تأخير.",
        },
      ],
    },
  },
};

export default function LegalPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const colors = useColors();
  const { isRTL, language } = useT();
  const insets = useSafeAreaInsets();

  const key = (page ?? "privacy-policy") as LegalPage;
  const bilingual = CONTENT[key] ?? CONTENT["privacy-policy"];
  const content = language === "ar" ? bilingual.ar : bilingual.en;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#112B4D",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name={isRTL ? "chevron-right" : "chevron-left"} size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
          {content.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {content.sections.map((section, idx) => (
          <View key={idx} style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionHeading, { color: colors.primary }, isRTL && styles.textRTL]}>
              {section.heading}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {section.body}
            </Text>
          </View>
        ))}

        <Text style={[styles.lastUpdated, { color: colors.mutedForeground }]}>
          {language === "ar" ? "آخر تحديث: أبريل 2026" : "Last updated: April 2026"}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  textRTL: {
    textAlign: "right",
  },
  lastUpdated: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
