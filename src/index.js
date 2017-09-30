// require('../vendor/cadesplugin_api');

/**
  * @name CryptoProProvider
  * @description Module provide methods for signing requests with Crypto Pro
  * @author Vitaly Mashanov <vvmashanov@yandex.ru>
  */

/**
  * @const
  * @name CADESCOM_CADES_BES
  * @description Signature type CAdES BES
  */
const CADESCOM_CADES_BES = 1;

/**
  * @const
  * @name CADESCOM_BASE64_TO_BINARY
  * @description Data will reencoded from base64 into binary array
  */
const CADESCOM_BASE64_TO_BINARY = 1;

/**
  * @const
  * @name CAPICOM_CERTIFICATE_FIND_SHA1_HASH
  * @description Finding certificates by SHA1 hash
  */
const CAPICOM_CERTIFICATE_FIND_SHA1_HASH = 0;

/**
  * @const
  * @name CADESCOM_HASH_ALGORITHM_CP_GOST_3411
  * @description Algorithm GOST R 34.11-94
  */
const CADESCOM_HASH_ALGORITHM_CP_GOST_3411 = 100;

/**
  * @const
  * @name cadesplugin
  * @description Provide access to cadesplugin_api
  */
const cadesplugin = window.cadesplugin;

/**
  * @function
  * @name isAsync
  * @description Checking, which method used by browser (Async or NPAPI)
  * @return {boolean}
  */
const _isAsync = () => cadesplugin.CreateObjectAsync ? true : false

/**
  * @function
  * @name certificates
  * @description Provides access to loaded certificates for browser
  * @return {array} list of certificates
  */
const _certificates = () => {
  return new Promise((resolve, reject) => {
    try {
      const store = cadesplugin.CreateObject("CAPICOM.Store");
      store.Open();

      const certificates = store.Certificates;
      const count = certificates.Count;

      const certificates_array = _prepareCertificates(certificates, [], count, 1, _prepareValue)

      store.Close();

      resolve(certificates_array);
    } catch (err) {
      reject(cadesplugin.getLastError(err));
    }
  });
}

/**
  * @function
  * @name certificatesAsync
  * @description Provides access to loaded certificates for browser (Async)
  * @return {array} list of certificates
  */
const _certificatesAsync = () => {
  return new Promise((resolve, reject) => {
    try {
      const store = _prepareValueAsync(cadesplugin.CreateObjectAsync("CAPICOM.Store"));
      _prepareValueAsync(store.Open());

      const certificates = _prepareValueAsync(store.Certificates);
      const count = _prepareValueAsync(certificates.Count);

      const certificates_array = _prepareCertificates(certificates, [], count, 1, _prepareValueAsync)

      _prepareValueAsync(store.Close());

      resolve(certificates_array);
    } catch(err) {
      reject(cadesplugin.getLastError(err));
    }
  });
}

/**
  * @function
  * @name sign
  * @description Signing xml documents or files
  * @param {string} thumbprint - hash of certificate
  * @param {string} base64 - xml document or file encoded to base64
  * @return {promise} signature
  */
const _sign = (thumbprint, base64) => {
  return new Promise(function (resolve, reject) {
    try {
      const store = cadesplugin.CreateObject("CAPICOM.Store");
      store.Open();

      try {
        const certificate = store
                              .Certificates
                              .Find(CAPICOM_CERTIFICATE_FIND_SHA1_HASH, thumbprint)
                              .Item(1);
      } catch(_err) {
        reject(`Сертификат не найден: ${thumbprint}`)
      }

      const signer = cadesplugin.CreateObject("CAdESCOM.CPSigner");
      signer.Certificate = certificate;

      const signedData = cadesplugin.CreateObject("CAdESCOM.CadesSignedData");
      signedData.ContentEncoding = CADESCOM_BASE64_TO_BINARY;
      signedData.Content = base64;

      try {
          const signature = signedData.SignCades(signer, CADESCOM_CADES_BES, true);
      } catch (err) {
          reject(cadesplugin.getLastError(err));
      }

      store.Close();

      resolve(signature);
    } catch (err) {
      reject(cadesplugin.getLastError(err));
    }
  });
}

/**
  * @function
  * @name signAsync
  * @description Signing xml documents or files (Async)
  * @param {string} thumbprint - hash of certificate
  * @param {string} base64 - xml document or file encoded to base64
  * @return {promise} signature
  */
const _signAsync = (thumbprint, base64) => {
  return new Promise(function (resolve, reject) {
    cadesplugin.async_spawn(function *(args) {
      try {
        const store = yield cadesplugin.CreateObjectAsync("CAPICOM.Store");
        yield store.Open();

        try {
          const certificatesObj = yield store.Certificates;
          const certificates = yield certificatesObj
                                        .Find(CAPICOM_CERTIFICATE_FIND_SHA1_HASH, args[0]);

          const certificate = yield certificates.Item(1);
        } catch (_err) {
          args[3]("Сертификат не найден: " + args[0])
        }

        const signer = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSigner");
        yield signer.propset_Certificate(certificate);

        const signedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
        yield signedData.propset_Content(args[1]);

        const signature = yield signedData.SignCades(signer, CADESCOM_CADES_BES, true);

        yield store.Close();

        args[2](signature);
      } catch (err) {
        args[3](cadesplugin.getLastError(err));
      }
    }, thumbprint, base64, resolve, reject);
  });
}

/**
  * @function
  * @name paramsForDetachedSignature
  * @description Method calculate value of signature
  * @param {string} thumbprint - hash of certificate
  * @param {string} base64 - SignedInfo of signature template encoded to base64
  * @return {promise} signature value and certificate value
  */
const _paramsForDetachedSignature = (thumbprint, base64) => {
  return new Promise(function (resolve, reject) {
    try {
      const hashedData = cadesplugin.CreateObject("CAdESCOM.HashedData");

      hashedData.Algorithm = CADESCOM_HASH_ALGORITHM_CP_GOST_3411;
      hashedData.DataEncoding = CADESCOM_BASE64_TO_BINARY;

      const hashed_data = hashedData.Hash(base64);

      const store = cadesplugin.CreateObject("CAPICOM.Store");

      store.Open();

      const certificate = store
                            .Certificates
                            .Find(CAPICOM_CERTIFICATE_FIND_SHA1_HASH, thumbprint)
                            .Item(1);

      const x509certificate = certificate.Export(0);

      const rawSignature = cadesplugin.CreateObject("CAdESCOM.RawSignature");

      const signatureHex = rawSignature.SignHash(hashed_data, certificate);

      store.Close();

      resolve({
        signature_value: _hexToBase64(signatureHex, '', signatureHex.length - 2),
        x509certificate: x509certificate
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
  * @function
  * @name paramsForDetachedSignatureAsync
  * @description Method calculate value of signature (Async)
  * @param {string} thumbprint - hash of certificate
  * @param {string} base64 - SignedInfo of signature template encoded to base64
  * @return {promise} signature value and certificate value
  */
const _paramsForDetachedSignatureAsync = (thumbprint, base64) => {
  return new Promise((resolve, reject) => {
    cadesplugin.async_spawn(function *(args) {
      try {
        const hashedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.HashedData");

        yield hashedData.propset_Algorithm(CADESCOM_HASH_ALGORITHM_CP_GOST_3411);
        yield hashedData.propset_DataEncoding(CADESCOM_BASE64_TO_BINARY);
        yield hashedData.Hash(args[1]);

        const hashed_data = yield hashedData;

        const store = yield cadesplugin.CreateObjectAsync("CAPICOM.Store");

        yield store.Open();


        const certificatesObj = yield store.Certificates;
        const certificates = yield certificatesObj
                                      .Find(CAPICOM_CERTIFICATE_FIND_SHA1_HASH, args[0]);

        const certificate = yield certificates.Item(1);

        const x509certificate = yield certificate.Export(0);

        const rawSignature = yield cadesplugin.CreateObjectAsync("CAdESCOM.RawSignature");

        const signatureHex = yield rawSignature.SignHash(hashed_data, certificate);

        yield store.Close();

        args[2]({
          signature_value: _hexToBase64(signatureHex, '', signatureHex.length - 2),
          x509certificate: x509certificate
        });
      } catch (err) {
        args[3](cadesplugin.getLastError(err));
      }
    }, thumbprint, base64, resolve, reject);
  });
}

/**
  * @function
  * @name _convertStringToObj
  * @description Method convert string into object
  * @param {string} str - string for convert
  * @return {object} converted string
  */
const _convertStringToObj = (str) => {
  const obj = new Object();

  str.split(', ').map(el => {
    obj[el.split('=')[0]] = el.split('=')[1]
  })

  return obj;
}

/**
  * @function
  * @name _hexToBase64
  * @description Method convert hex into base64
  * @param {string} hex - string for convert
  * @param {string} str - empty string
  * @param {string} index - start position of substring
  * @return {string} converted base64 string
  */
const _hexToBase64 = (hex, str, index) => {
  if (index >= 0) {
    return _hexToBase64(
      hex,
      str + String.fromCharCode(parseInt(hex.substr(index, 2), 16)),
      index - 2
    )
  }

  return window.btoa(str);
}

const _prepareValue = (value) => value

const _prepareValueAsync = async (value) => await value

const _prepareCertificates = (certificates, list, size, index, prepareValue) => {
  if (index <= size) {
    try {
      const certificate = certificates.Item(index);
      const is_valid = certificate.IsValid();

      list.concat({
        issuer_name: _convertStringToObj(prepareValue(certificate.IssuerName)),
        serial_number: prepareValue(certificate.SerialNumber),
        subject_name: _convertStringToObj(prepareValue(certificate.SubjectName)),
        thumbprint: prepareValue(certificate.Thumbprint),
        private_key: prepareValue(certificate.PrivateKey),
        valid_from_date: prepareValue(certificate.ValidFromDate),
        valid_to_date: prepareValue(certificate.ValidToDate),
        is_valid: prepareValue(is_valid.Result),
        version: prepareValue(certificate.Version)
      });
    } catch(err) { console.error(err) }

    return _prepareCertificates(certificates, list, size, index + 1, prepareValue);
  }

  return list;
}

export const Certificates = () => _isAsync() ? _certificatesAsync : _certificates
export const Sign = () => _isAsync() ? _signAsync : _sign
export const ParamsForDetachedSignature = () => _isAsync() ? _paramsForDetachedSignatureAsync : _paramsForDetachedSignature
