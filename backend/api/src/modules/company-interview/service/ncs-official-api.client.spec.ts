import { normalizeOfficialSearchPayload } from './ncs-official-api.client';

describe('normalizeOfficialSearchPayload', () => {
  it('groups official NCS007 rows into one versioned unit with competency elements', () => {
    const units = normalizeOfficialSearchPayload({
      response: {
        header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
        body: {
          items: {
            item: [
              {
                USG_YN: 'Y',
                NCS_LCLAS_CD: '20',
                NCS_LCLAS_CDNM: '정보통신',
                NCS_MCLAS_CD: '2001',
                NCS_MCLAS_CDNM: '정보기술',
                NCS_SCLAS_CD: '200102',
                NCS_SCLAS_CDNM: '정보기술개발',
                NCS_SUBD_CD: '20010202',
                NCS_SUBD_CDNM: '응용SW엔지니어링',
                NCS_DEGR: '24',
                NCS_COMPE_UNIT_CD: '2001020201_24v6',
                NCS_CL_CD: '2001020201',
                COMPE_UNIT_NAME: '요구사항 확인',
                DEF: '업무 분석가가 정의한 요구사항을 확인하는 능력이다.',
                LEVEL: '3',
                VER_NO: '6',
                COMPE_UNIT_FACTR_NO_CD: '2001020201_24v6.1',
                COMPE_UNIT_FACTR_NO: '1',
                COMPE_UNIT_FACTR_NAME: '현행 시스템 분석하기',
                COMPE_UNIT_FACTR_LEVEL: '3',
              },
              {
                USG_YN: 'Y',
                NCS_LCLAS_CD: '20',
                NCS_LCLAS_CDNM: '정보통신',
                NCS_MCLAS_CD: '2001',
                NCS_MCLAS_CDNM: '정보기술',
                NCS_SCLAS_CD: '200102',
                NCS_SCLAS_CDNM: '정보기술개발',
                NCS_SUBD_CD: '20010202',
                NCS_SUBD_CDNM: '응용SW엔지니어링',
                NCS_DEGR: '24',
                NCS_COMPE_UNIT_CD: '2001020201_24v6',
                NCS_CL_CD: '2001020201',
                COMPE_UNIT_NAME: '요구사항 확인',
                DEF: '업무 분석가가 정의한 요구사항을 확인하는 능력이다.',
                LEVEL: '3',
                VER_NO: '6',
                COMPE_UNIT_FACTR_NO_CD: '2001020201_24v6.2',
                COMPE_UNIT_FACTR_NO: '2',
                COMPE_UNIT_FACTR_NAME: '요구사항 확인하기',
                COMPE_UNIT_FACTR_LEVEL: '3',
              },
            ],
          },
        },
      },
    });

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      classificationCode: '2001020201',
      unitCode: '2001020201_24v6',
      unitName: '요구사항 확인',
      definition: '업무 분석가가 정의한 요구사항을 확인하는 능력이다.',
      unitLevel: '3',
      ncsDegree: '24',
      version: '6',
      sourceProvider: '한국산업인력공단',
    });
    expect(units[0]?.elements.map((element) => element.elementName)).toEqual([
      '현행 시스템 분석하기',
      '요구사항 확인하기',
    ]);
  });
});
