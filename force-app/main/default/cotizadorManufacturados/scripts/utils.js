export function generateUniqueId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return `id-${timestamp}-${random}`;
}

export function roundAndAddZeros(numero, decimales) {
  let numeroString = numero;
  if (typeof numeroString === "number") numeroString = String(numeroString);
  let redondeado = numero.toFixed(decimales);
  while (redondeado.split(".")[1].length < 4) {
    redondeado += "0";
  }
  return redondeado;
}

export function round(
  value,
  decimals,
  toNumber = false,
  extension = undefined,
) {
  const roundVar = Math.pow(10, decimals);
  const roundNumber = Math.round(value * roundVar) / roundVar;
  if (toNumber) {
    if (extension) {
      return Number(roundNumber.toFixed(decimals)).toFixed(extension);
    }
    return Number(roundNumber.toFixed(decimals));
  }
  return roundNumber.toFixed(decimals);
}

export function averages(data) {
  const averages = {};
  const keys = Object.keys(data[0]);
  keys.forEach((key) => {
    if (!isNaN(Number(data[0][key]))) {
      const sum = data.reduce((acc, obj) => acc + Number(obj[key]), 0);
      averages[key] = sum / data.length;
    } else {
      averages[key] = data[0][key];
    }
  });
  return averages;
}

export function truncate(value, decimals, zeros = 3) {
  const roundVar = Math.pow(10, decimals);
  const roundNumber = Math.trunc(value * roundVar) / roundVar;
  return roundNumber.toFixed(zeros);
}

export function sumObject(obj) {
  if (obj.length === 0) return null;
  const result = obj.reduce((acc, c, i) => {
    const keys = Object.keys(c);
    keys.forEach((k) => {
      let value;
      const validNumber = Number(c[k]);
      if (typeof c[k] === "string" && !validNumber) {
        value = c[k].trim() === "" ? 0 : 1;
      } else {
        value = validNumber;
      }
      if (acc[k]) acc[k] += value;
      else acc[k] = value;
    });
    return acc;
  }, {});
  return result;
}

export const ObjectValidator = {
  isValid(obj, excludedKeys = []) {
    if (typeof obj !== "object" || obj === null) {
      throw new Error("El argumento debe ser un objeto válido.");
    }

    if (!Array.isArray(excludedKeys)) {
      throw new Error("El segundo argumento debe ser un arreglo de keys.");
    }

    return Object.entries(obj).every(([key, value]) => {
      if (excludedKeys.includes(key)) {
        return true;
      }
      return value !== null && value !== undefined && value !== "";
    });
  },
  areValuesEqual(objA, objB, mappings) {
    if (
      typeof objA !== "object" ||
      objA === null ||
      typeof objB !== "object" ||
      objB === null
    ) {
      throw new Error("Los dos primeros argumentos deben ser objetos válidos.");
    }

    if (!Array.isArray(mappings)) {
      throw new Error("El tercer argumento debe ser un arreglo de strings.");
    }

    return mappings.every((mapping) => {
      const [keyA, keyB] = mapping.split("=");
      if (!keyA || !keyB) {
        throw new Error(
          `El mapeo '${mapping}' no es válido. Debe tener el formato 'keyA=keyB'.`,
        );
      }

      return objA[keyA] === objB[keyB];
    });
  },
};

export function newObj(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export const sumProductDivide = (items, properties) => {
  if (!Array.isArray(items) || !Array.isArray(properties)) return 0;
  const sumProduct = items.reduce((acc, item) => {
    const product = properties.slice(0, 2).reduce((prodAcc, prop) => {
      const result = prodAcc * (Number(item[prop]) * 100);
      return result / 100;
    }, 1);
    return acc + product;
  }, 0);
  const sumThirdArray = items.reduce(
    (acc, item) => acc + Number(item[properties[2]]),
    0,
  );
  if (sumThirdArray === 0) return 0;

  // console.log(sumProduct);
  // console.log(sumThirdArray);
  // console.log(sumProduct / sumThirdArray);

  return sumProduct / sumThirdArray;
};