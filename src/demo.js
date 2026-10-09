export function demoForm() {
  return `<div class="application-heading"><div class="company-mark">青</div><div><span class="eyebrow">QINGHE TECHNOLOGY</span><h2>青禾科技 · 校园招聘</h2><p>2027 届 · 前端开发工程师 · 杭州</p></div><span class="tag">演示页面</span></div>
    <div class="application-progress"><span class="current">01 基本资料</span><span>02 在线测评</span><span>03 完成投递</span></div>
    <form id="application-form" novalidate>
      <section data-zheg-section="基本信息"><h3><span>01</span> 基本信息</h3><div class="form-grid">
        <label>姓名 <b>*</b><input name="applicantName" type="text" placeholder="请输入姓名" required></label>
        <label>联系电话 <b>*</b><input name="phone" type="tel" placeholder="请输入手机号" required></label>
        <label>电子邮箱 <b>*</b><input name="email" type="email" placeholder="name@example.com" required></label>
        <label>现居城市<input name="city" type="text" placeholder="请输入城市"></label>
        <div class="radio-group" role="group" aria-label="性别"><span class="field-label">性别</span><div class="radio-options"><label><input type="radio" name="gender" value="female">女</label><label><input type="radio" name="gender" value="male">男</label></div></div>
      </div></section>
      ${educationSection(1)}
      ${educationSection(2)}
      <section data-zheg-section="实习经历"><h3><span>04</span> 实习经历</h3><div class="form-grid">
        <label>实习单位<input name="company" type="text" placeholder="公司名称"></label>
        <label>实习岗位<input name="position" type="text" placeholder="职位名称"></label>
        <label>开始时间<input name="internStart" type="month"></label><label>结束时间<input name="internEnd" type="month"></label>
        <label class="full">工作内容<textarea name="description" rows="3" placeholder="描述你的工作内容与成果"></textarea></label>
      </div></section>
      <section data-zheg-section="其他信息"><h3><span>05</span> 其他信息</h3><div class="form-grid">
        <label>你的称呼<input name="preferredName" type="text" placeholder="这个字段需要你来确认"></label>
        <label>推荐码<input name="referral" type="text" value="QH-CAMPUS" aria-label="推荐码"></label>
      </div></section>
      <div class="application-footer"><p>这是体验用表单，不会投递或发送个人信息。</p><button type="reset" class="button secondary" id="reset-demo">清空表单</button><button type="button" class="button disabled" disabled>提交申请（演示不可用）</button></div>
    </form>`;
}
function educationSection(number) {
  return `<section data-zheg-section="教育经历"><h3><span>0${number + 1}</span> 教育经历 <small>第 ${number} 段</small></h3><div class="form-grid">
    <label>所在高校 <b>*</b><input name="school${number}" type="text" placeholder="请输入学校名称"></label>
    <label>专业名称<input name="major${number}" type="text" placeholder="请输入专业"></label>
    <label>学历<select name="degree${number}"><option value="">请选择学历</option><option value="bachelor">本科</option><option value="master">硕士</option><option value="phd">博士</option></select></label>
    <label>开始时间<input name="eduStart${number}" type="month"></label><label>结束时间<input name="eduEnd${number}" type="month"></label>
  </div></section>`;
}
