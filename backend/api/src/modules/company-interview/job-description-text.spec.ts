import { toAiJobDescriptionText } from './job-description-text';

describe('toAiJobDescriptionText', () => {
  it('removes posting metadata and media while preserving readable JD sections', () => {
    const html = [
      '<blockquote data-init-posting-extra-info="true"><p><strong>공고 조건</strong></p><p>경력: 8년</p></blockquote>',
      '<!-- init-structured-job-description:start -->',
      '<div data-init-structured-job-description="true">',
      '<figure><img src="company.png" alt="회사 로고"><figcaption>회사 이미지</figcaption></figure>',
      '<section><h2>포지션 상세</h2><p>DevOps &amp; SRE 플랫폼을 운영합니다.</p></section>',
      '<section><h2>주요 업무</h2><ul><li>Kubernetes 운영</li><li>CI/CD 개선</li></ul></section>',
      '</div>',
      '<!-- init-structured-job-description:end -->',
    ].join('');

    expect(toAiJobDescriptionText(html)).toBe([
      '포지션 상세',
      'DevOps & SRE 플랫폼을 운영합니다.',
      '주요 업무',
      'Kubernetes 운영',
      'CI/CD 개선',
    ].join('\n'));
  });

  it('keeps plain text unchanged except for whitespace normalization', () => {
    expect(toAiJobDescriptionText('  NestJS와   PostgreSQL 기반\r\n서비스 개발  ')).toBe(
      'NestJS와 PostgreSQL 기반\n서비스 개발',
    );
  });

  it('returns an empty string for markup without readable text', () => {
    expect(toAiJobDescriptionText('<figure><img src="only-image.png"></figure>')).toBe('');
  });
});
