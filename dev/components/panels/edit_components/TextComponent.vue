<template>
    <input type="text" v-model="fields[fieldName].value" v-bind:placeholder="placeholder"/>
</template>

<script>
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    props: ["placeholder"]
};
</script>

<style lang="sass">
</style>
